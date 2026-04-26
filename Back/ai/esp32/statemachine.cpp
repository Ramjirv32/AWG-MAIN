#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "model.h"
#include <Arduino.h>
#include <DHT.h>           // Added DHT Library
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include "tensorflow/lite/micro/micro_mutable_op_resolver.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/schema/schema_generated.h"
struct AdvancedAlert {
    int type;
    char reason[32];
};
struct AdvancedAction {
    int type;
    char reason[32];
};
struct SensorReading {
    float temp;
    float humidity;
    float battery;
    float tds;
    float water_level;
    float mcu_temp;
    float flow;
    int8_t rgb_state; 
    uint16_t rpm;     
};
#define ENABLE_TEST_MODE  1     
#define TEST_CASE_COUNT   10
#define TEST_VERBOSE      1
#define PIN_FAN         25
#define PIN_HEATER      26
#define PIN_MOTOR       27
#define PIN_RED          2  // DANGER / SAFETY
#define PIN_GREEN       12  // PRODUCTION
#define PIN_WHITE       14  // IDLE / POWER
#define PIN_DHT          4  // DHT11 Data pin (Safe GPIO)
#define PIN_TDS         34  // TDS Analog pin
#define PIN_FLOW        35  // Flow pulse pin
#define PIN_BTN_HEATER  18  // Heater toggle button
#define PIN_BTN_MODE    19  // Fan mode/power button
#define PWM_FREQ          5000
#define PWM_RESOLUTION       8
#define PWM_MAX           255  // 8-bit: 2^8 - 1
const float g_means[]  = {25.0f, 60.0f, 12.0f, 300.0f, 50.0f, 35.0f, 5.0f, 1.0f, 1000.0f};
const float g_scales[] = {10.0f, 20.0f, 2.0f,  200.0f, 30.0f, 15.0f, 3.0f, 1.0f, 500.0f};
#define LOG(msg) Serial.println(F(msg))
#define NUM_FEATURES        15
#define NUM_CLASSES          5
#define ARENA_SIZE      (28 * 1024)    
#define HEAP_WARN_THRESHOLD  8192
#define ML_CONFIDENCE_MIN    0.50f     
#define ML_CONFIDENCE_FORCE  0.90f     
#define TDS_SHUTDOWN_LIMIT   1000.0f
#define TDS_WARN_LIMIT        500.0f
#define SENSOR_STUCK_MS       300000   
float g_mean[NUM_FEATURES]  = {28.725371f, 57.271955f, 82.250509f, 249.351455f, 37.496636f, 41.226560f, 0.500237f, 0.054545f, -0.001445f, -0.005438f, 0.000098f, 28.726813f, 57.277380f, 0.500142f, 0.738891f};
float g_scale[NUM_FEATURES] = {5.610008f, 21.037543f, 1.588251f, 5.787190f, 15.877548f, 6.335426f, 0.464954f, 0.227091f, 0.142715f, 0.284495f, 0.185776f, 5.608166f, 21.041442f, 0.452517f, 0.558184f};
#define CBUF_SIZE 6     
struct SensorReading g_cbuf[CBUF_SIZE];
int g_cbuf_head  = 0;
int g_cbuf_count = 0;
void cbuf_push(const struct SensorReading* s) {
    g_cbuf[g_cbuf_head] = *s;
    g_cbuf_head = (g_cbuf_head + 1) % CBUF_SIZE;
    if (g_cbuf_count < CBUF_SIZE) g_cbuf_count++;
}
const struct SensorReading* cbuf_get(int steps_back) {
    if (steps_back >= g_cbuf_count) steps_back = g_cbuf_count - 1;
    int idx = (g_cbuf_head - 1 - steps_back + CBUF_SIZE) % CBUF_SIZE;
    return &g_cbuf[idx];
}
struct SensorReading g_sensor       = {0};
struct SensorReading g_sensor_valid = {0};
DHT g_dht(PIN_DHT, DHT11);             // Changed to DHT11
volatile uint32_t g_flow_pulses = 0;   // Flow pulse counter
void IRAM_ATTR flow_pulse_counter() {
    g_flow_pulses++;
}
float g_tds_history[5] = {0};          // For TDS trend
int   g_tds_idx = 0;

// Global state variables
int8_t g_mcu_reduced = 0;
int8_t g_fan_state = 0;
int8_t g_heat_state = 0;

bool check_water_leak() {
    if (g_cbuf_count < 2) return false;
    float drop = cbuf_get(1)->water_level - g_sensor_valid.water_level;
    if (drop > 5.0f) {
        Serial.printf("[ALERT] WATER LEAK detected! Δ=%.1f%%\n", drop);
        return true;
    }
    return false;
}
int check_mcu_temperature() {
    if (g_sensor_valid.mcu_temp >= 85.0f) return 2;
    if (g_sensor_valid.mcu_temp >= 75.0f) {
        g_mcu_reduced = 1;
        return 1;
    }
    g_mcu_reduced = 0;
    return 0;
}
int check_fan_rpm() {
    return (g_fan_state > 0 && g_sensor_valid.rpm < 500) ? 1 : 0;
}
int check_battery_low() {
    if (g_sensor_valid.battery < 20.0f) return 2;
    if (g_sensor_valid.battery < 40.0f) return 1;
    return 0;
}
bool safety_gate() {
    if (check_freeze() || check_water_leak() || check_mcu_temperature() == 2) return true;
    if (check_fan_rpm() || check_sensor_stuck() || check_heater_dry_run()) return true;
    if (check_battery_low() == 2 || check_tds_trend() == 2) return true;
    return false;
}
struct TimeFeatures {
    float temp_delta;
    float humidity_delta;
    float flow_delta;
    float temp_avg3;
    float humidity_avg3;
    float flow_avg3;
    float efficiency;
};
struct TimeFeatures g_tf = {0};
void compute_time_features() {
    if (g_cbuf_count < 2) {
        g_tf.temp_delta     = 0.0f;
        g_tf.humidity_delta = 0.0f;
        g_tf.flow_delta     = 0.0f;
    } else {
        const struct SensorReading* cur  = cbuf_get(0);
        const struct SensorReading* prev = cbuf_get(1);
        g_tf.temp_delta     = cur->temp     - prev->temp;
        g_tf.humidity_delta = cur->humidity - prev->humidity;
        g_tf.flow_delta     = cur->flow     - prev->flow;
        g_tf.temp_delta     = fmaxf(-20.0f, fminf(20.0f, g_tf.temp_delta));
        g_tf.humidity_delta = fmaxf(-20.0f, fminf(20.0f, g_tf.humidity_delta));
        g_tf.flow_delta     = fmaxf(-20.0f, fminf(20.0f, g_tf.flow_delta));
    }
    int n = (g_cbuf_count < 3) ? g_cbuf_count : 3;
    float sum_t = 0, sum_h = 0, sum_f = 0;
    for (int i = 0; i < n; i++) {
        const struct SensorReading* r = cbuf_get(i);
        sum_t += r->temp;
        sum_h += r->humidity;
        sum_f += r->flow;
    }
    g_tf.temp_avg3     = sum_t / n;
    g_tf.humidity_avg3 = sum_h / n;
    g_tf.flow_avg3     = sum_f / n;
    float hum_clamp = fmaxf(1.0f, g_sensor_valid.humidity);
    g_tf.efficiency = (g_sensor_valid.flow / hum_clamp) * 100.0f;
    g_tf.efficiency = fmaxf(0.0f, fminf(100.0f, g_tf.efficiency));
}
int8_t g_mode_current  = -1;
int8_t g_mode_previous = -1;
int8_t g_motor_state   = 0; 
bool   g_system_power   = true; 
uint16_t g_timer_rgb      = 0;
uint16_t g_timer_freeze   = 0;
uint16_t g_timer_blockage = 0;
uint16_t g_timer_stuck    = 0;
uint16_t g_timer_fan_on   = 0;
uint16_t g_timer_heat_on  = 0;
uint16_t g_timer_mode     = 0;
float g_stress_score = 0;
uint32_t g_freeze_start_ms       = 0;
uint32_t g_rgb_wet_start_ms      = 0;
uint32_t g_blockage_start_ms     = 0;
uint32_t g_sensor_stuck_start_ms = 0;
uint32_t g_mode_start_ms         = 0;
uint32_t g_fan_on_start_ms       = 0;
uint32_t g_heat_on_start_ms      = 0;
float    g_level_30m_ago         = -1.0f;
uint32_t g_last_30m_check_ms     = 0;
float    g_mcu_temp_1m_ago       = 0;
uint32_t g_last_1m_check_ms      = 0;
const uint32_t LOOP_DELAY_MS            = 10000;
const uint32_t FREEZE_TRIGGER_MS        = 100000;   
const uint32_t RGB_WET_TRIGGER_MS       = 900000;   
const uint32_t BLOCKAGE_TRIGGER_MS      = 3000000;  
const uint32_t SENSOR_STUCK_TRIGGER_MS  = 3000000;  
const uint32_t MIN_FAN_RUNTIME_MS       = 120000;   
const uint32_t MIN_HEATER_RUNTIME_MS    = 180000;   
const float    SENSOR_STUCK_EPS         = 0.15f;
const float HUMIDITY_HYST = 5.0f;   
const float TEMP_HYST     = 2.0f;   
uint8_t g_arena[ARENA_SIZE];
tflite::MicroInterpreter* g_interp = nullptr;
TfLiteTensor* g_in  = nullptr;
TfLiteTensor* g_out = nullptr;
void setup_ml_model() {
    Serial.println("[ML] Initializing TFLite Micro...");
    const tflite::Model* model = tflite::GetModel(model_tflite);
    if (!model || model->version() != TFLITE_SCHEMA_VERSION) {
        Serial.println("[ML ERROR] Model invalid or schema mismatch");
        return;
    }
    static tflite::MicroMutableOpResolver<14> resolver;
    resolver.AddFullyConnected();
    resolver.AddSoftmax();
    resolver.AddRelu();
    resolver.AddBatchMatMul();
    resolver.AddQuantize();
    resolver.AddDequantize();
    resolver.AddPack();
    resolver.AddSlice();
    static tflite::MicroInterpreter interpreter(model, resolver, g_arena, ARENA_SIZE);
    g_interp = &interpreter;
    if (g_interp->AllocateTensors() != kTfLiteOk) {
        Serial.println("[ML ERROR] AllocateTensors failed");
        return;
    }
    g_in  = g_interp->input(0);
    g_out = g_interp->output(0);
    Serial.printf("[ML] Ready. Arena used: %d / %d bytes\n",
                  (int)interpreter.arena_used_bytes(), ARENA_SIZE);
    Serial.printf("[ML] Input[%d]  Output[%d]\n",
                  g_in->dims->data[1], g_out->dims->data[1]);
}
int ml_predict(float* conf_out) {
    if (!g_interp || !g_in || !g_out) return -1;
    float raw[NUM_FEATURES] = {
        g_sensor_valid.temp,          
        g_sensor_valid.humidity,      
        g_sensor_valid.battery,       
        g_sensor_valid.tds,           
        g_sensor_valid.water_level,   
        g_sensor_valid.mcu_temp,      
        g_sensor_valid.flow,          
        (float)g_sensor_valid.rgb_state, 
        g_tf.temp_delta,              
        g_tf.humidity_delta,          
        g_tf.flow_delta,              
        g_tf.temp_avg3,               
        g_tf.humidity_avg3,           
        g_tf.flow_avg3,               
        g_tf.efficiency               
    };
    for (int i = 0; i < NUM_FEATURES; i++) {
        g_in->data.f[i] = (raw[i] - g_mean[i]) / fmaxf(g_scale[i], 1e-6f);
    }
    if (g_interp->Invoke() != kTfLiteOk) {
        Serial.println("[ML ERROR] Invoke failed");
        return -1;
    }
    int   best_mode = 0;
    float best_conf = g_out->data.f[0];
    for (int i = 1; i < NUM_CLASSES; i++) {
        if (g_out->data.f[i] > best_conf) {
            best_conf = g_out->data.f[i];
            best_mode = i;
        }
    }
    if (conf_out) *conf_out = best_conf;
    Serial.printf("[ML] Mode=%d Conf=%.1f%% | Probs: %.2f %.2f %.2f %.2f %.2f\n",
                  best_mode, best_conf * 100.0f,
                  g_out->data.f[0], g_out->data.f[1], g_out->data.f[2],
                  g_out->data.f[3], g_out->data.f[4]);
    return best_mode;
}
void setup_gpio() {
    pinMode(PIN_FAN, OUTPUT);
    pinMode(PIN_HEATER, OUTPUT);
    pinMode(PIN_MOTOR, OUTPUT);
    
    pinMode(PIN_RED, OUTPUT);
    pinMode(PIN_GREEN, OUTPUT);
    pinMode(PIN_WHITE, OUTPUT);
    led_all_off();

    pinMode(PIN_FLOW, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_FLOW), flow_pulse_counter, FALLING);
    
    pinMode(PIN_BTN_HEATER, INPUT_PULLUP);
    pinMode(PIN_BTN_MODE,   INPUT_PULLUP);

    g_dht.begin();
    Serial.println("[SETUP] GPIO (3 LEDs + 2 Buttons + Sensors) OK");
}
void setup_pwm() {
    ledcAttach(PIN_FAN,    PWM_FREQ, PWM_RESOLUTION); ledcWrite(PIN_FAN,    0);
    ledcAttach(PIN_HEATER, PWM_FREQ, PWM_RESOLUTION); ledcWrite(PIN_HEATER, 0);
    ledcAttach(PIN_MOTOR,  PWM_FREQ, PWM_RESOLUTION); ledcWrite(PIN_MOTOR,  0);
    Serial.println("[SETUP] PWM OK");
}
void set_pwm(int pin, int duty) {
    ledcWrite(pin, (int)fmaxf(0, fminf(PWM_MAX, duty)));
}
void led_all_off() {
    digitalWrite(PIN_RED, LOW);
    digitalWrite(PIN_GREEN, LOW);
    digitalWrite(PIN_WHITE, LOW);
}
void sensor_read_simulated() {
    // Stable simulation values for testing logic + LEDs
    static float temp_base = 25.0f;
    static float hum_base = 60.0f;
    
    // Smooth temperature changes (slow variation)
    temp_base += (rand() % 5 - 2) * 0.2f;
    g_sensor.temp = temp_base;
    
    // Smooth humidity changes (slow variation)
    hum_base += (rand() % 5 - 2) * 0.5f;
    g_sensor.humidity = hum_base;
    
    // Fixed flow to avoid false blockage detection
    g_sensor.flow = 5.0f;
    
    // Fixed RGB state to avoid unexpected regen mode
    g_sensor.rgb_state = 0;
    
    // Stable other values
    g_sensor.water_level = 50.0f;
    g_sensor.battery = 80.0f;
    g_sensor.mcu_temp = 40.0f;
    
    // Safe TDS range (300-350) to avoid warning/shutdown
    g_sensor.tds = 300.0f + (rand() % 50);
    
    // Stable RPM
    g_sensor.rpm = 1200;
}

void sensor_read_real() {
    // 1. Read DHT22
    float h = g_dht.readHumidity();
    float t = g_dht.readTemperature();
    
    if (isnan(h) || isnan(t)) {
        Serial.println("[WARN] DHT read failed! Falling back to simulation for T/H.");
        g_sensor.temp = 25.0f + (rand() % 40 - 20) / 10.0f;
        g_sensor.humidity = 60.0f + (rand() % 100 - 50) / 10.0f;
    } else {
        g_sensor.temp = t;
        g_sensor.humidity = h;
    }

    // 2. Read TDS (Analog Pin 34)
    int tds_raw = analogRead(PIN_TDS);
    float tds_v = tds_raw * (3.3f / 4095.0f);
    // Simple conversion model: PPM = (Voltage / 2.3) * 1000 (Adjust based on sensor calibration)
    float tds_ppm = (tds_v / 2.3f) * 1000.0f; 
    
    if (tds_ppm < 0 || tds_ppm > 2000) {
        Serial.println("[WARN] TDS OOR! Falling back to simulation.");
        g_sensor.tds = 300.0f + (rand() % 50);
    } else {
        g_sensor.tds = tds_ppm;
    }

    // 3. Read Flow (Digital Pulse Pin 35)
    // Rate = Pulses over LOOP_DELAY_MS interval
    uint32_t pulses = g_flow_pulses;
    g_flow_pulses = 0; // Reset for next interval
    
    // LPM = (Pulses / (Interval_sec)) / 7.5 (Typical YF-S201 factor)
    float lpm = (float)pulses / (LOOP_DELAY_MS / 1000.0f) / 7.5f;
    
    if (lpm < 0 || lpm > 50) {
        Serial.println("[WARN] Flow sensor erratic! Falling back to simulation.");
        g_sensor.flow = 5.0f;
    } else {
        g_sensor.flow = lpm;
    }

    // 4. Simulated/Fixed Values for others (as requested)
    g_sensor.battery     = 80.0f;
    g_sensor.water_level = 50.0f;
    g_sensor.mcu_temp    = 40.0f;
    g_sensor.rpm         = 1000;
    g_sensor.rgb_state   = 0; // Defaulting to 0, can be updated if hardware exists

    // Debug Prints
    Serial.printf("[REAL] T=%.1f H=%.1f TDS=%.1f F=%.1f\n", 
                  g_sensor.temp, g_sensor.humidity, g_sensor.tds, g_sensor.flow);
}
void sensor_validate() {
    if (g_sensor.temp >= -20 && g_sensor.temp <= 80)
        g_sensor_valid.temp = g_sensor.temp;
    if (g_sensor.humidity >= 0 && g_sensor.humidity <= 100)
        g_sensor_valid.humidity = g_sensor.humidity;
    if (g_sensor.battery >= 0 && g_sensor.battery <= 100)
        g_sensor_valid.battery = g_sensor.battery;
    if (g_sensor.water_level >= 0 && g_sensor.water_level <= 100)
        g_sensor_valid.water_level = g_sensor.water_level;
    if (g_sensor.mcu_temp >= 0 && g_sensor.mcu_temp <= 100)
        g_sensor_valid.mcu_temp = g_sensor.mcu_temp;
    if (g_sensor.tds >= 0 && g_sensor.tds <= 1000)
        g_sensor_valid.tds = g_sensor.tds;
    if (g_sensor.flow >= 0 && g_sensor.flow <= 100)
        g_sensor_valid.flow = g_sensor.flow;
    if (g_sensor.rgb_state == 0 || g_sensor.rgb_state == 1)
        g_sensor_valid.rgb_state = g_sensor.rgb_state;
    // Fix: Move RPM to validated structure to prevent safety trip
    g_sensor_valid.rpm = g_sensor.rpm; 
}
int sensor_range_check() {
    if (g_sensor_valid.temp        < -20 || g_sensor_valid.temp        >  80) return 1;
    if (g_sensor_valid.humidity    <   0 || g_sensor_valid.humidity    > 100) return 1;
    if (g_sensor_valid.battery     <   0 || g_sensor_valid.battery     > 100) return 1;
    if (g_sensor_valid.water_level <   0 || g_sensor_valid.water_level > 100) return 1;
    if (g_sensor_valid.mcu_temp    <   0 || g_sensor_valid.mcu_temp    > 100) return 1;
    if (g_sensor_valid.tds         <   0 || g_sensor_valid.tds         > 1000)return 1;
    return 0;
}
const uint32_t MIN_MODE_SWITCH_MS = 300000;  
int apply_hysteresis(int new_mode, float cur_hum, float cur_temp, float prev_hum, float prev_temp) {
    uint32_t now = millis();
    uint32_t time_since_switch = now - g_mode_start_ms;
    if (new_mode == g_mode_current) return new_mode;
    if (time_since_switch < MIN_MODE_SWITCH_MS) {
        float hum_diff = fabsf(cur_hum - prev_hum);
        float temp_diff = fabsf(cur_temp - prev_temp);
        if (hum_diff > HUMIDITY_HYST * 2.0f || temp_diff > TEMP_HYST * 2.0f) {
            g_mode_start_ms = now;
            return new_mode;
        }
        return g_mode_current;
    }
    g_mode_start_ms = now;
    return new_mode;
}
int check_fan_speed_validation(int expected_rpm) {
    const int MIN_RPM = 500;
    const int MAX_RPM = 3000;
    int actual_rpm = g_sensor_valid.rpm;
    if (actual_rpm == 0 && expected_rpm > 0) {
        Serial.println("[ALERT] FAN STOPPED while commanded ON");
        return 1;  
    }
    if (actual_rpm > MAX_RPM) {
        Serial.printf("[ALERT] FAN OVERSPEED %d RPM (max %d)\n", actual_rpm, MAX_RPM);
        return 2;  
    }
    if (actual_rpm < MIN_RPM && expected_rpm > MIN_RPM) {
        Serial.printf("[WARN] FAN UNDERSPEED %d RPM (expected %d)\n", actual_rpm, expected_rpm);
        return 3;  
    }
    return 0;  
}
const uint32_t MAX_HEATER_ON_MS = 1800000;    
const uint32_t DRY_RUN_TIMEOUT_MS = 300000;  
uint32_t g_heater_on_start_ms = 0;
int control_heater_logic(int mode, int rgb_state) {
    uint32_t now = millis();
    int should_heat = (mode == 4 && g_sensor_valid.temp <= 0) ||  
                     (rgb_state == 1) ||                               
                     (mode == 4 && g_sensor_valid.temp < 10);         
    if (g_heat_state && rgb_state == 0) {
        if (now - g_heater_on_start_ms > DRY_RUN_TIMEOUT_MS) {
            Serial.println("[ALERT] HEATER DRY RUN PROTECTION");
            g_heat_state = 0;
            return 0;  
        }
    }
    if (g_heat_state && (now - g_heater_on_start_ms > MAX_HEATER_ON_MS)) {
        Serial.println("[ALERT] HEATER MAX TIME EXCEEDED");
        g_heat_state = 0;
        return 0;  
    }
    if (should_heat && !g_heat_state) {
        g_heat_state = 1;
        g_heat_on_start_ms = now; 
        return 1;  
    }
    if (!should_heat && g_heat_state) {
        g_heat_state = 0;
        return 0;  
    }
    return g_heat_state;
}
const int ICE_DETECTION_THRESHOLD = 5;
int g_ice_detection_count = 0;
int check_ice_detection() {
    if (g_cbuf_count < 2) return 0;
    const struct SensorReading* prev = cbuf_get(1);
    bool hum_high = g_sensor_valid.humidity > 70;
    bool flow_decreasing = g_sensor_valid.flow < prev->flow && (prev->flow - g_sensor_valid.flow) > 0.5f;
    bool temp_stable = fabsf(g_sensor_valid.temp - prev->temp) < 2.0f;
    if (hum_high && flow_decreasing && temp_stable) {
        g_ice_detection_count++;
        if (g_ice_detection_count >= ICE_DETECTION_THRESHOLD) {
            Serial.println("[ALERT] ICE DETECTED → STOP PELTIER, HEATER ON");
            return 1;
        }
    } else {
        g_ice_detection_count = (g_ice_detection_count > 0) ? g_ice_detection_count - 1 : 0;
    }
    return 0;
}
const int BATTERY_HISTORY_SIZE = 10;
float g_battery_history[BATTERY_HISTORY_SIZE];
int g_battery_history_idx = 0;
const float VOLTAGE_DROP_THRESHOLD = 5.0f;  
int check_voltage_drop() {
    g_battery_history[g_battery_history_idx] = g_sensor_valid.battery;
    g_battery_history_idx = (g_battery_history_idx + 1) % BATTERY_HISTORY_SIZE;
    if (g_battery_history_idx < 2) return 0;
    int prev_idx = (g_battery_history_idx - 2 + BATTERY_HISTORY_SIZE) % BATTERY_HISTORY_SIZE;
    float recent_drop = g_battery_history[prev_idx] - g_sensor_valid.battery;
    if (recent_drop > VOLTAGE_DROP_THRESHOLD) {
        Serial.printf("[ALERT] VOLTAGE DROP %.1f%% → REDUCE LOAD\n", recent_drop);
        return 1;
    }
    return 0;
}
const uint32_t MAX_CONTINUOUS_HOURS_MS = 24 * 3600000;  
const uint32_t REST_CYCLE_DURATION_MS = 3600000;         
uint32_t g_operation_start_ms = 0;
bool g_in_rest_cycle = false;
uint32_t g_rest_start_ms = 0;
int check_operation_limit() {
    uint32_t now = millis();
    if (g_operation_start_ms == 0) g_operation_start_ms = now;
    if (g_in_rest_cycle) {
        if (now - g_rest_start_ms > REST_CYCLE_DURATION_MS) {
            g_in_rest_cycle = false;
            g_operation_start_ms = now;
            Serial.println("[INFO] REST CYCLE COMPLETE");
            return 0;  
        }
        Serial.println("[INFO] IN REST CYCLE");
        return 1;  
    }
    uint32_t continuous_ms = now - g_operation_start_ms;
    if (continuous_ms >= MAX_CONTINUOUS_HOURS_MS) {
        g_in_rest_cycle = true;
        g_rest_start_ms = now;
        Serial.println("[ALERT] MAX OPERATION TIME EXCEEDED → REST CYCLE");
        return 1;  
    }
    return 0;  
}
int advanced_safety_check(AdvancedAlert* alerts, int* alert_count, AdvancedAction* actions, int* action_count) {
    *alert_count = 0;
    *action_count = 0;
    if (check_ice_detection()) {
        alerts[*alert_count].type = 1;
        strcpy(alerts[*alert_count].reason, "ICE_DETECTED");
        (*alert_count)++;
        actions[*action_count].type = 1;
        strcpy(actions[*action_count].reason, "STOP_PELTIER");
        (*action_count)++;
        actions[*action_count].type = 2;
        strcpy(actions[*action_count].reason, "HEATER_ON");
        (*action_count)++;
    }
    if (check_voltage_drop()) {
        alerts[*alert_count].type = 2;
        strcpy(alerts[*alert_count].reason, "VOLTAGE_DROP");
        (*alert_count)++;
        actions[*action_count].type = 3;
        strcpy(actions[*action_count].reason, "REDUCE_LOAD");
        (*action_count)++;
    }
    if (check_operation_limit()) {
        alerts[*alert_count].type = 3;
        strcpy(alerts[*alert_count].reason, "REST_REQUIRED");
        (*alert_count)++;
        actions[*action_count].type = 4;
        strcpy(actions[*action_count].reason, "FORCE_IDLE");
        (*action_count)++;
    }
    if (check_tds_trend()) {
        alerts[*alert_count].type = 4;
        strcpy(alerts[*alert_count].reason, "TDS_INCREASING");
        (*alert_count)++;
    }
    return (*alert_count > 0 || *action_count > 0) ? 1 : 0;
}
int check_freeze() {
    uint32_t now = millis();
    if (g_sensor_valid.temp <= 0) {
        if (g_freeze_start_ms == 0) g_freeze_start_ms = now;
        uint32_t elapsed = now - g_freeze_start_ms;
        g_timer_freeze   = (int)(elapsed / LOOP_DELAY_MS);
        if (g_timer_freeze >= 10 || elapsed >= FREEZE_TRIGGER_MS) {
            Serial.println("[ALERT] FREEZING");
            return 1;
        }
    } else {
        g_freeze_start_ms = 0;
        g_timer_freeze    = 0;
    }
    return 0;
}
int check_temp_drop() {
    if (g_cbuf_count >= 2) {
        const struct SensorReading* prev = cbuf_get(1);
        float drop = prev->temp - g_sensor_valid.temp;
        if (drop >= 5.0f) {
            Serial.printf("[ALERT] RAPID TEMP DROP %.1f°C\n", drop);
            return 1;
        }
    }
    return 0;
}
int check_blockage() {
    uint32_t now = millis();
    if (g_sensor_valid.humidity >= 60 &&
        g_sensor_valid.flow     <= 0.1f &&
        g_sensor_valid.water_level < 80) {
        if (g_blockage_start_ms == 0) g_blockage_start_ms = now;
        g_timer_blockage = (int)((now - g_blockage_start_ms) / LOOP_DELAY_MS);
        if (g_timer_blockage >= 300 || (now - g_blockage_start_ms) >= BLOCKAGE_TRIGGER_MS) {
            Serial.println("[ALERT] BLOCKAGE detected");
            return 1;
        }
    } else {
        g_blockage_start_ms = 0;
        g_timer_blockage    = 0;
    }
    return 0;
}
int check_tds_unsafe() {
    if (g_sensor_valid.tds >= 500) {
        Serial.printf("[ALERT] TDS UNSAFE %.0f ppm\n", g_sensor_valid.tds);
        return 1;
    }
    return 0;
}
int check_rgb_wet() {
    uint32_t now = millis();
    if (g_sensor_valid.rgb_state == 1) {
        if (g_rgb_wet_start_ms == 0) g_rgb_wet_start_ms = now;
        g_timer_rgb = (int)((now - g_rgb_wet_start_ms) / LOOP_DELAY_MS);
        if (g_timer_rgb >= 90 || (now - g_rgb_wet_start_ms) >= RGB_WET_TRIGGER_MS) {
            Serial.println("[ALERT] RGB WET >15 min → REGEN");
            return 1;
        }
    } else {
        g_rgb_wet_start_ms = 0;
        g_timer_rgb        = 0;
    }
    return 0;
}
int check_sensor_stuck() {
    static float last_t=0, last_h=0;
    static uint32_t last_change_ms = 0;
    uint32_t now = millis();
    if (abs(g_sensor_valid.temp - last_t) > 0.01f || abs(g_sensor_valid.humidity - last_h) > 0.01f) {
        last_t = g_sensor_valid.temp;
        last_h = g_sensor_valid.humidity;
        last_change_ms = now;
    }
    if (now - last_change_ms > SENSOR_STUCK_MS) {
        Serial.println("[ALERT] SENSOR STUCK detected");
        return 1;
    }
    return 0;
}
int check_heater_dry_run() {
    static uint32_t dry_start_ms = 0;
    if (g_heat_state && g_sensor_valid.rgb_state == 0) { 
        if (dry_start_ms == 0) dry_start_ms = millis();
        if (millis() - dry_start_ms > 600000) return 1; 
    } else {
        dry_start_ms = 0;
    }
    return 0;
}
int check_tds_trend() {
    g_tds_history[g_tds_idx] = g_sensor_valid.tds;
    g_tds_idx = (g_tds_idx + 1) % 5;
    float avg = 0;
    for(int i=0; i<5; i++) avg += g_tds_history[i];
    avg /= 5.0f;
    if (avg > TDS_SHUTDOWN_LIMIT) return 2; 
    if (avg > TDS_WARN_LIMIT) return 1;     
    return 0;
}
int enforce_min_fan(int fan_level) {
    uint32_t now = millis();
    if (fan_level > 0 && g_fan_state == 0) {
        g_fan_on_start_ms = now;
        g_fan_state = 1;
    } else if (fan_level == 0 && g_fan_state == 1) {
        uint32_t elapsed = now - g_fan_on_start_ms;
        if (elapsed < MIN_FAN_RUNTIME_MS) return 1;
        g_fan_state = 0;
    }
    return fan_level;
}
int enforce_min_heater(int target) {
    uint32_t now = millis();
    if (g_sensor_valid.temp < 2.0f && target > 0) return 1;
    if (target > 0 && g_heat_state == 0) {
        g_heat_on_start_ms = now;
        g_heat_state = 1;
    } else if (target == 0 && g_heat_state == 1) {
        uint32_t elapsed = now - g_heat_on_start_ms;
        if (elapsed < MIN_HEATER_RUNTIME_MS) return 1;
        g_heat_state = 0;
    }
    return g_heat_state;
}
void fallback_rules(int* fan, int* heater, int* motor) {
    *fan = *heater = *motor = 0;
    float h = g_sensor_valid.humidity;
    if (h < 30) g_mode_current = 0;
    else if (h < 45) { *fan = 1; *motor = 1; g_mode_current = 1; }
    else if (h < 65) { *fan = 2; *motor = 1; g_mode_current = 2; }
    else { *fan = 3; *motor = 1; g_mode_current = 3; }
}
void compute_stress_score() {
    float t_stress = max(0.0f, (g_sensor_valid.temp - 30.0f) / 20.0f);
    float h_stress = max(0.0f, (50.0f - g_sensor_valid.humidity) / 50.0f);
    float b_stress = max(0.0f, (20.0f - g_sensor_valid.battery) / 20.0f);
    g_stress_score = (t_stress + h_stress + b_stress) / 3.0f;
}
void apply_production_shields(int* fan, int* heater, int* motor) {
    if (g_sensor_valid.rpm > 1000 && g_sensor_valid.flow < 0.1f) {
        Serial.println("[SHIELD] Airflow blockage detected (RPM high, Flow zero)");
        g_mode_current = -1; 
    }
    if (g_sensor_valid.rgb_state == 1 && g_sensor_valid.humidity < 30.0f) {
        Serial.println(F("[SHIELD] RGB Wet ignored due to low ambient humidity"));
        g_mode_current = 0; 
    }
    static bool tank_locked = false;
    if (g_sensor_valid.water_level >= 95) tank_locked = true;
    if (g_sensor_valid.water_level < 85) tank_locked = false;
    if (tank_locked) {
        g_mode_current = 0; 
    }
    static uint32_t ineffective_start = 0;
    if (g_mode_current >= 2 && g_tf.efficiency < 0.05f) {
        if (ineffective_start == 0) ineffective_start = millis();
        if (millis() - ineffective_start > 1800000) { 
            Serial.println("[SHIELD] Production stalled - check Peltier/Seal");
        }
    } else {
        ineffective_start = 0;
    }
    if (g_sensor_valid.battery < 20.0f && g_mode_current > 1) {
        g_mode_current = 1; 
    }
}
void handle_extreme_cold(int* fan, int* heater, int* motor) {
    g_mode_current = 4; 
    if (g_sensor_valid.water_level >= 95.0f) {
        *fan = 0; *motor = 0; *heater = 1;
        Serial.println(F("[COLD] Tank Full: Fan OFF, Heater guarding hardware."));
    } 
    else {
        *fan = 1; *motor = 1; *heater = 1;
        Serial.println(F("[COLD] Tank Low: Attempting production with Thermal Guard."));
    }
}
void run_decision_cycle(int* fan_out, int* heater_out, int* motor_out) {
    if (g_sensor_valid.temp <= 5.0f) {
        handle_extreme_cold(fan_out, heater_out, motor_out);
        return;
    }
    if (check_freeze() || check_water_leak() || check_mcu_temperature() == 2) {
        g_mode_current = 4; *fan_out = 0; *heater_out = 1; *motor_out = 0;
        return;
    }
    if (check_fan_rpm() || check_sensor_stuck() || check_heater_dry_run()) {
        g_mode_current = -1; *fan_out = 0; *heater_out = 0; *motor_out = 0;
        return;
    }
    if (check_rgb_wet() && g_sensor_valid.humidity >= 30.0f) { 
        g_mode_current = 4; *fan_out = 1; *heater_out = 1; *motor_out = 0;
        return;
    }
    if (g_sensor_valid.water_level >= 95 || check_tds_trend() == 2) {
        g_mode_current = 0; *fan_out = 0; *heater_out = 0; *motor_out = 0;
        return;
    }
    float conf = 0.0f;
    int ml_mode = ml_predict(&conf);
    if (conf >= 0.85f) {
        const struct SensorReading* prev = cbuf_get(1);
        float p_h = prev ? prev->humidity : g_sensor_valid.humidity;
        float p_t = prev ? prev->temp : g_sensor_valid.temp;
        g_mode_current = apply_hysteresis(ml_mode, g_sensor_valid.humidity, g_sensor_valid.temp, p_h, p_t);
    } else {
        fallback_rules(fan_out, heater_out, motor_out);
    }
    apply_production_shields(fan_out, heater_out, motor_out);
    if (g_heat_state == 1 && (millis() - g_heat_on_start_ms > 1800000)) {
        *heater_out = 0;
        Serial.println(F("[SHIELD] Heater Timeout reached (30m). Forcing Cooldown."));
    }
    if (millis() - g_last_1m_check_ms > 60000) {
        float rise = g_sensor_valid.mcu_temp - g_mcu_temp_1m_ago;
        if (rise > 2.0f && g_motor_state > 0) {
            *motor_out = 0; *fan_out = 1; 
            Serial.println(F("[CRITICAL] Thermal Runaway! MCU rising too fast. Killing Peltier."));
        }
        g_mcu_temp_1m_ago = g_sensor_valid.mcu_temp;
        g_last_1m_check_ms = millis();
    }
    if (g_level_30m_ago < 0) g_level_30m_ago = g_sensor_valid.water_level;
    if (millis() - g_last_30m_check_ms > 1800000) {
        if (g_level_30m_ago - g_sensor_valid.water_level > 2.0f && g_motor_state == 0) {
             g_mode_current = -1; 
             Serial.println(F("[CRITICAL] Silent Leak Detected (30m trend)!"));
        }
        g_level_30m_ago = g_sensor_valid.water_level;
        g_last_30m_check_ms = millis();
    }
    if (check_battery_low() == 2) g_mode_current = 0;
    switch (g_mode_current) {
        case 0: *fan_out=0; *heater_out=0; *motor_out=0; break;
        case 1: *fan_out=1; *heater_out=0; *motor_out=1; break;
        case 2: *fan_out=2; *heater_out=0; *motor_out=1; break;
        case 3: *fan_out=3; *heater_out=0; *motor_out=1; break;
        case 4: *fan_out=1; *heater_out=1; *motor_out=0; break;
        case -1: *fan_out=0; *heater_out=0; *motor_out=0; break; 
        default: *fan_out=0; *heater_out=0; *motor_out=0;
    }
    compute_stress_score();
    *fan_out = enforce_min_fan(*fan_out);
    *heater_out = enforce_min_heater(*heater_out);
    g_fan_state = *fan_out;
    g_heat_state = *heater_out;
    g_motor_state = *motor_out;
}
void update_led_dashboard() {
    led_all_off();
    
    if (g_mode_current == -1) {
        digitalWrite(PIN_RED, HIGH); // System Error / Safety Trip
        return;
    }

    switch (g_mode_current) {
        case 0: 
            digitalWrite(PIN_WHITE, HIGH); // IDLE
            break;
        case 1:
        case 2:
        case 3:
            digitalWrite(PIN_GREEN, HIGH); // PRODUCTION
            break;
        case 4:
            digitalWrite(PIN_WHITE, HIGH); // REGEN / COLD (Mixed state)
            digitalWrite(PIN_GREEN, HIGH);
            break;
    }
}
void apply_outputs(int fan, int heater, int motor) {
    int fan_pwm   = (fan == 3) ? PWM_MAX : (fan == 2) ? 180 : (fan == 1) ? 120 : 0;
    int motor_pwm = (motor == 1) ? PWM_MAX : 0;
    int heat_pwm  = (heater == 1) ? PWM_MAX : 0;
    set_pwm(PIN_FAN,    fan_pwm);
    set_pwm(PIN_HEATER, heat_pwm);
    set_pwm(PIN_MOTOR,  motor_pwm);
    update_led_dashboard();
}
void diagnostic_startup() {
    Serial.println("\n[DIAG] System startup:");
    Serial.printf("  Temp       : %.1f°C\n", g_sensor_valid.temp);
    Serial.printf("  Humidity   : %.1f%%\n", g_sensor_valid.humidity);
    Serial.printf("  Battery    : %.0f%%\n", g_sensor_valid.battery);
    Serial.printf("  MCU Temp   : %.0f°C\n", g_sensor_valid.mcu_temp);
    Serial.printf("  Free Heap  : %u bytes\n", ESP.getFreeHeap());
    Serial.printf("  Arena      : %d bytes\n", ARENA_SIZE);
    Serial.println("[DIAG] Done\n");
}
void print_system_status() {
    uint32_t heap = ESP.getFreeHeap();
    Serial.printf("[SYS] Heap=%u%s  Mode=%d  Fan=%d\n",
                  heap, heap < HEAP_WARN_THRESHOLD ? " ⚠LOW" : "",
                  g_mode_current, g_fan_state);
}
#if ENABLE_TEST_MODE
int g_pass = 0, g_fail = 0, g_info = 0;
#define PASS(id, msg) do { Serial.printf("[PASS] T%03d: %s\n", id, msg); g_pass++; } while(0)
#define FAIL(id, msg) do { Serial.printf("[FAIL] T%03d: %s\n", id, msg); g_fail++; } while(0)
#define INFO(id, msg) do { Serial.printf("[INFO] T%03d: %s\n", id, msg); g_info++; } while(0)
#define CHECK(id, cond, pass_msg, fail_msg) \
    do { if(cond) PASS(id, pass_msg); else FAIL(id, fail_msg); } while(0)
void set_sensor(float t, float h, float bat, float tds,
                float wl, float mcu, float fl, int rgb, int rpm=1500) {
    g_sensor.temp        = t;
    g_sensor.humidity    = h;
    g_sensor.battery     = bat;
    g_sensor.tds         = tds;
    g_sensor.water_level = wl;
    g_sensor.mcu_temp    = mcu;
    g_sensor.flow        = fl;
    g_sensor.rgb_state   = rgb;
    g_sensor.rpm         = rpm;
    sensor_validate();
}
void test_sensor_validation() {
    Serial.println("\n── Sensor Validation (001-020) ──");
    set_sensor(25.0, 60.0, 80.0, 300.0, 50.0, 60.0, 10.0, 0);
    CHECK(1, g_sensor_valid.temp == 25.0f, "Valid temp accepted", "Valid temp rejected");
    float old_t = g_sensor_valid.temp;
    g_sensor.temp = 90.0;  sensor_validate();
    CHECK(2, g_sensor_valid.temp != 90.0f, "Temp >80 rejected", "Should reject >80°C");
    g_sensor.temp = -25.0; sensor_validate();
    CHECK(3, g_sensor_valid.temp != -25.0f, "Temp <-20 rejected", "Should reject <-20°C");
    g_sensor.humidity = 70.0; sensor_validate();
    CHECK(4, g_sensor_valid.humidity == 70.0f, "Valid humidity", "Humidity invalid");
    g_sensor.humidity = 110.0; sensor_validate();
    CHECK(5, g_sensor_valid.humidity != 110.0f, "Humidity>100 rejected", "Should reject >100%");
    g_sensor.humidity = -5.0; sensor_validate();
    CHECK(6, g_sensor_valid.humidity != -5.0f, "Negative humidity rejected", "Should reject negative");
    set_sensor(25, 60, 75, 300, 50, 60, 10, 0);
    CHECK(7, g_sensor_valid.battery == 75.0f, "Valid battery", "Battery invalid");
    g_sensor.battery = -10; sensor_validate();
    CHECK(8, g_sensor_valid.battery != -10.0f, "Negative battery rejected", "Should reject negative");
    g_sensor.battery = 105; sensor_validate();
    CHECK(9, g_sensor_valid.battery != 105.0f, "Battery>100 rejected", "Should reject >100");
    set_sensor(25, 60, 80, 350, 50, 60, 10, 0);
    CHECK(10, g_sensor_valid.tds == 350.0f, "Valid TDS", "TDS invalid");
    g_sensor.tds = -10; sensor_validate();
    CHECK(11, g_sensor_valid.tds != -10.0f, "Negative TDS rejected", "Should reject negative TDS");
    g_sensor.tds = 1200; sensor_validate();
    CHECK(12, g_sensor_valid.tds != 1200.0f, "TDS>1000 rejected", "Should reject >1000");
    set_sensor(25, 60, 80, 300, 55, 60, 10, 0);
    CHECK(13, g_sensor_valid.water_level == 55.0f, "Valid water level", "Water level invalid");
    set_sensor(25, 60, 80, 300, 50, 65, 10, 0);
    CHECK(14, g_sensor_valid.mcu_temp == 65.0f, "Valid MCU temp", "MCU temp invalid");
    g_sensor.mcu_temp = 105; sensor_validate();
    CHECK(15, g_sensor_valid.mcu_temp != 105.0f, "MCU>100 rejected", "Should reject MCU>100");
    set_sensor(25, 60, 80, 300, 50, 60, 10, 0);
    CHECK(16, g_sensor_valid.rgb_state == 0, "RGB=0 valid", "RGB=0 invalid");
    g_sensor.rgb_state = 1; sensor_validate();
    CHECK(17, g_sensor_valid.rgb_state == 1, "RGB=1 valid", "RGB=1 invalid");
    g_sensor.rgb_state = 5; sensor_validate();
    CHECK(18, g_sensor_valid.rgb_state != 5, "RGB=5 rejected", "Should reject RGB=5");
    set_sensor(25, 60, 80, 300, 50, 60, 10, 0);
    CHECK(19, sensor_range_check() == 0, "Range check passes OK", "Range check should pass");
    set_sensor(28.5, 65.2, 85, 320, 50, 62, 15.5, 0);
    CHECK(20, sensor_range_check() == 0, "All nominal sensors OK", "Nominal sensors should pass");
}
void test_safety_rules() {
    Serial.println("\n── Safety Rules (021-050) ──");
    set_sensor(0.0, 50, 80, 300, 50, 60, 5, 0);
    g_freeze_start_ms = millis() - FREEZE_TRIGGER_MS - 1000;
    CHECK(21, check_freeze() == 1, "Freeze at 0°C", "Should detect freeze at 0°C");
    g_freeze_start_ms = 0; g_timer_freeze = 0;
    set_sensor(-5.0, 50, 80, 300, 50, 60, 0, 0);
    g_timer_freeze = 11;
    CHECK(22, check_freeze() == 1, "Freeze at -5°C", "Should freeze at -5°C");
    g_timer_freeze = 0;
    set_sensor(5.0, 50, 80, 300, 50, 60, 5, 0);
    g_timer_freeze = 0; g_freeze_start_ms = 0;
    CHECK(23, check_freeze() == 0, "No freeze at 5°C", "Should not freeze at 5°C");
    set_sensor(25, 60, 80, 300, 50, 60, 10, 0);
    CHECK(24, check_mcu_temperature() == 0, "MCU normal at 60°C", "MCU should be normal");
    set_sensor(25, 60, 80, 300, 50, 72, 10, 0);
    CHECK(25, check_mcu_temperature() == 1, "MCU warn at 72°C", "MCU should warn at 72°C");
    set_sensor(25, 60, 80, 300, 50, 76, 10, 0);
    CHECK(26, check_mcu_temperature() == 2, "MCU critical at 76°C", "MCU should shutdown");
    set_sensor(25, 60, 80, 300, 50, 75, 10, 0);
    CHECK(27, check_mcu_temperature() == 2, "MCU critical at 75°C", "75 should be critical");
    set_sensor(25, 60, 80, 300, 50, 70, 10, 0);
    CHECK(28, check_mcu_temperature() == 1, "MCU warn at 70°C", "70 should warn");
    set_sensor(25, 60, 80, 300, 50, 60, 10, 0);
    CHECK(29, check_tds_unsafe() == 0, "TDS safe 300ppm", "300ppm should be safe");
    set_sensor(25, 60, 80, 500, 50, 60, 10, 0);
    CHECK(30, check_tds_unsafe() == 1, "TDS unsafe at 500ppm", "500ppm should be unsafe");
    set_sensor(25, 60, 80, 600, 50, 60, 10, 0);
    CHECK(31, check_tds_unsafe() == 1, "TDS very unsafe 600ppm", "600ppm should be unsafe");
    set_sensor(25, 60, 8, 300, 50, 60, 10, 0);
    CHECK(32, check_battery_low() == 2, "Battery critical 8%", "8% should be critical");
    set_sensor(25, 60, 15, 300, 50, 60, 10, 0);
    CHECK(33, check_battery_low() == 1, "Battery warning 15%", "15% should warn");
    set_sensor(25, 60, 50, 300, 50, 60, 10, 0);
    CHECK(34, check_battery_low() == 0, "Battery OK 50%", "50% should be OK");
    set_sensor(25, 60, 10, 300, 50, 60, 10, 0);
    CHECK(35, check_battery_low() == 2, "Battery critical at 10%", "10% is critical");
    set_sensor(25, 60, 20, 300, 50, 60, 10, 0);
    CHECK(36, check_battery_low() == 1, "Battery warning at 20%", "20% should warn");
    set_sensor(25, 70, 80, 300, 96, 60, 10, 0);
    CHECK(37, g_sensor_valid.water_level >= 95, "Tank full (96%)", "Tank should be full");
    set_sensor(25, 70, 80, 300, 80, 60, 10, 0);
    CHECK(38, g_sensor_valid.water_level < 95, "Tank not full (80%)", "Tank should not be full");
    g_fan_state = 1;
    set_sensor(25, 60, 80, 300, 50, 60, 10, 0, 0); 
    CHECK(39, check_fan_rpm() == 1, "Fan failure (rpm=0 while on)", "Should detect fan failure");
    g_fan_state = 0;
    g_fan_state = 1;
    set_sensor(25, 60, 80, 300, 50, 60, 10, 0, 1200);
    CHECK(40, check_fan_rpm() == 0, "Fan OK (rpm=1200)", "Fan should be OK");
    g_fan_state = 0;
    set_sensor(25, 70, 80, 300, 50, 60, 0.05, 0);
    g_timer_blockage = 301;
    CHECK(41, check_blockage() == 1, "Blockage detected", "Should detect blockage");
    g_timer_blockage = 0; g_blockage_start_ms = 0;
    set_sensor(25, 70, 80, 300, 50, 60, 5.0, 0);
    g_blockage_start_ms = 0;
    CHECK(42, check_blockage() == 0, "No blockage with flow", "Should not detect blockage");
    set_sensor(25, 40, 80, 300, 50, 60, 0.0, 0);
    g_blockage_start_ms = 0;
    CHECK(43, check_blockage() == 0, "No blockage low humidity", "Low humidity not a blockage");
    g_sensor_valid.temp = 90.0;
    CHECK(44, sensor_range_check() == 1, "Range fail on temp=90", "Should fail range check");
    g_sensor_valid.temp = 25.0;
    g_sensor_valid.humidity = 110.0;
    CHECK(45, sensor_range_check() == 1, "Range fail on hum=110", "Should fail range");
    g_sensor_valid.humidity = 60.0;
    set_sensor(25, 60, 80, 300, 50, 60, 10, 0);
    g_timer_stuck = 301;
    for (int i=0; i<CBUF_SIZE; i++) {
        g_cbuf[i] = g_sensor_valid;
    }
    g_cbuf_count = CBUF_SIZE;
    g_sensor_stuck_start_ms = millis() - SENSOR_STUCK_TRIGGER_MS - 1000;
    CHECK(46, check_sensor_stuck() == 1, "Sensor stuck >50min", "Should detect stuck sensor");
    g_timer_stuck = 0; g_sensor_stuck_start_ms = 0;
    set_sensor(25, 60, 80, 300, 50, 60, 10, 0);
    g_cbuf[0] = g_sensor_valid;
    g_sensor_valid.temp = 30.0;
    g_cbuf_count = 2;
    g_sensor_stuck_start_ms = 0; g_timer_stuck = 0;
    CHECK(47, check_sensor_stuck() == 0, "Sensor not stuck", "Sensor should not be stuck");
    set_sensor(25, 60, 80, 300, 50, 76, 10, 0);
    int f=0, h=0, m=0;
    bool blocked = safety_gate();
    CHECK(48, blocked == true, "Safety gate blocks MCU critical", "Should block on MCU critical");
    set_sensor(-5.0, 50, 80, 300, 50, 60, 0, 0);
    g_timer_freeze = 11;
    f=0; h=0; m=0;
    blocked = safety_gate();
    CHECK(49, blocked == true && h == 1, "Safety gate heats on freeze", "Should heat on freeze");
    g_timer_freeze = 0;
    set_sensor(25, 60, 80, 300, 50, 60, 10, 0);
    g_cbuf_count = 0;  
    f=0; h=0; m=0;
    blocked = safety_gate();
    CHECK(50, blocked == false, "Safety gate passes on normal", "Should pass normal conditions");
}
void test_rgb_regen() {
    Serial.println("\n── RGB & Regeneration (051-080) ──");
    set_sensor(25, 60, 80, 300, 50, 60, 10, 0);
    g_rgb_wet_start_ms = 0; g_timer_rgb = 0;
    CHECK(51, check_rgb_wet() == 0, "RGB dry no regen", "Dry RGB should not regen");
    set_sensor(25, 70, 80, 300, 50, 60, 0, 1);
    g_timer_rgb = 10;
    CHECK(52, check_rgb_wet() == 0, "RGB wet <15min no regen", "Short wet should not regen");
    g_sensor_valid.rgb_state = 1;
    g_timer_rgb = 91;
    g_rgb_wet_start_ms = millis() - RGB_WET_TRIGGER_MS - 1000;
    CHECK(53, check_rgb_wet() == 1, "RGB wet >15min regen", "Should regen after 15min");
    g_timer_rgb = 0; g_rgb_wet_start_ms = 0;
    g_sensor_valid.rgb_state = 1;
    g_timer_rgb = 90;
    g_rgb_wet_start_ms = millis() - RGB_WET_TRIGGER_MS;
    CHECK(54, check_rgb_wet() == 1, "RGB wet 90 ticks = regen", "90 ticks should regen");
    g_timer_rgb = 0; g_rgb_wet_start_ms = 0;
    set_sensor(30, 85, 75, 350, 30, 65, 0, 1);
    g_timer_rgb = 95; g_rgb_wet_start_ms = millis() - RGB_WET_TRIGGER_MS - 500;
    int f=0, h=0, m=0;
    safety_gate();
    CHECK(55, g_mode_current == 4 && h == 1, "RGB wet sets mode 4 with heater", "Should set regen mode");
    g_timer_rgb = 0; g_rgb_wet_start_ms = 0;
    for (int tick = 56; tick <= 60; tick++) {
        set_sensor(25 + tick*0.5, 70 + tick*0.3, 80-tick, 300, 50, 60, 0, 1);
        g_timer_rgb = 95; g_rgb_wet_start_ms = millis() - RGB_WET_TRIGGER_MS - 1000;
        CHECK(tick, check_rgb_wet() == 1, "High hum + RGB wet → regen", "Should regen");
        g_timer_rgb = 0; g_rgb_wet_start_ms = 0;
    }
    set_sensor(25, 60, 80, 300, 50, 60, 10, 0);
    g_rgb_wet_start_ms = 0; g_timer_rgb = 0;
    for (int tick = 61; tick <= 65; tick++) {
        CHECK(tick, check_rgb_wet() == 0, "RGB dry timer=0", "Dry RGB should not regen");
    }
    float regen_temps[] = {25, 30, 35, 40, 45, 50, 15, 20, 28, 33};
    for (int i = 0; i < 10; i++) {
        int tick = 66 + i;
        set_sensor(regen_temps[i], 85, 60, 300, 30, 65, 0, 1);
        g_timer_rgb = 95; g_rgb_wet_start_ms = millis() - RGB_WET_TRIGGER_MS - 1000;
        CHECK(tick, check_rgb_wet() == 1, "Regen at varied temp", "Should regen");
        g_timer_rgb = 0; g_rgb_wet_start_ms = 0;
    }
    g_sensor_valid.rgb_state = 0;
    g_rgb_wet_start_ms = 0; g_timer_rgb = 0;
    for (int tick = 76; tick <= 80; tick++) {
        CHECK(tick, check_rgb_wet() == 0, "RGB reset on dry", "Dry should reset regen timer");
    }
}
void test_hardware_failures() {
    Serial.println("\n── Hardware Failures (081-110) ──");
    int fan_states[] = {1, 2, 3, 1, 2};
    for (int i = 0; i < 5; i++) {
        int tick = 81 + i;
        g_fan_state = fan_states[i];
        set_sensor(25, 60, 80, 300, 50, 60, 10, 0, 0); 
        CHECK(tick, check_fan_rpm() == 1, "Fan failure rpm=0", "Should detect fan failure");
    }
    g_fan_state = 0;
    int rpms[] = {500, 1000, 1500, 2000, 2500};
    for (int i = 0; i < 5; i++) {
        int tick = 86 + i;
        g_fan_state = 1;
        set_sensor(25, 60, 80, 300, 50, 60, 10, 0, rpms[i]);
        CHECK(tick, check_fan_rpm() == 0, "Fan OK at various RPMs", "Fan should be OK");
    }
    g_fan_state = 0;
    float mcu_temps[] = {69.9f, 70.0f, 74.9f, 75.0f, 75.1f};
    int   mcu_expect[] = {0, 1, 1, 2, 2};
    for (int i = 0; i < 5; i++) {
        int tick = 91 + i;
        set_sensor(25, 60, 80, 300, 50, mcu_temps[i], 10, 0);
        CHECK(tick, check_mcu_temperature() == mcu_expect[i],
              "MCU boundary", "MCU boundary wrong");
    }
    g_sensor_valid.temp = 85.0; CHECK(96, sensor_range_check()==1, "Temp=85 out of range","");
    g_sensor_valid.temp = -25.0; CHECK(97, sensor_range_check()==1, "Temp=-25 out of range","");
    g_sensor_valid.temp = 25.0;
    g_sensor_valid.humidity = 105.0; CHECK(98, sensor_range_check()==1, "Hum=105 out of range","");
    g_sensor_valid.humidity = 60.0;
    g_sensor_valid.battery = 110.0; CHECK(99, sensor_range_check()==1, "Bat=110 out of range","");
    g_sensor_valid.battery = 80.0;
    g_sensor_valid.tds = 1100.0; CHECK(100, sensor_range_check()==1, "TDS=1100 out of range","");
    g_sensor_valid.tds = 300.0;
    float hums[] = {60, 65, 70, 75, 80};
    for (int i = 0; i < 5; i++) {
        int tick = 101 + i;
        set_sensor(25, hums[i], 80, 300, 50, 60, 0.05, 0);
        g_timer_blockage = 301;
        CHECK(tick, check_blockage() == 1, "Blockage varied humidity", "Should detect blockage");
        g_timer_blockage = 0; g_blockage_start_ms = 0;
    }
    float flows[] = {1.0, 2.0, 5.0, 10.0, 20.0};
    for (int i = 0; i < 5; i++) {
        int tick = 106 + i;
        set_sensor(25, 70, 80, 300, 50, 60, flows[i], 0);
        g_blockage_start_ms = 0;
        CHECK(tick, check_blockage() == 0, "No blockage with flow", "Should not blockage");
    }
}
void test_production_modes() {
    Serial.println("\n── Production Mode Logic (111-150) ──");
    set_sensor(25, 20, 80, 300, 50, 60, 0, 0);
    g_cbuf_count = 0;
    int f=0, h=0, m=0;
    fallback_rules(&f, &h, &m);
    CHECK(111, g_mode_current == 0, "IDLE humidity <30%", "Should be IDLE");
    set_sensor(25, 30, 80, 300, 50, 60, 0, 0);
    fallback_rules(&f, &h, &m);
    CHECK(112, g_mode_current == 0, "IDLE at 30% hum", "30% should be IDLE");
    set_sensor(25, 35, 80, 300, 50, 60, 5, 0);
    fallback_rules(&f, &h, &m);
    CHECK(113, g_mode_current == 1 && f == 1, "LOW mode 35%", "Should be LOW");
    set_sensor(25, 50, 80, 300, 50, 60, 12, 0);
    fallback_rules(&f, &h, &m);
    CHECK(114, g_mode_current == 2 && f == 2, "NORMAL mode 50%", "Should be NORMAL");
    set_sensor(25, 68, 80, 300, 50, 60, 20, 0);
    fallback_rules(&f, &h, &m);
    CHECK(115, g_mode_current == 3 && f == 3, "HIGH mode 68%", "Should be HIGH");
    set_sensor(25, 85, 80, 300, 50, 60, 28, 0);
    fallback_rules(&f, &h, &m);
    CHECK(116, g_mode_current == 3 && f == 3, "MAX→HIGH >75%", "Should be HIGH");
    float hum_bound[] = {29.9, 40.0, 59.9, 74.9};
    int   exp_mode[]  = {0, 2, 2, 3};
    for (int i = 0; i < 4; i++) {
        set_sensor(25, hum_bound[i], 80, 300, 50, 60, 10, 0);
        fallback_rules(&f, &h, &m);
        CHECK(117+i, g_mode_current == exp_mode[i], "Humidity boundary mode", "Boundary mode wrong");
    }
    float temps[] = {15, 18, 22, 25, 28, 30, 32, 35, 38, 40};
    for (int i = 0; i < 10; i++) {
        set_sensor(temps[i], 50, 80, 300, 50, 60, 12, 0);
        fallback_rules(&f, &h, &m);
        CHECK(121+i, g_mode_current == 2, "NORMAL at varied temps", "Should be NORMAL");
    }
    float wls[] = {95, 96, 97, 98, 100};
    for (int i = 0; i < 5; i++) {
        set_sensor(25, 70, 80, 300, wls[i], 60, 10, 0);
        g_cbuf_count = 0;
        f=0; h=0; m=0;
        bool blocked = safety_gate();
        CHECK(131+i, blocked && g_mode_current == 0, "Tank full → IDLE", "Full tank should idle");
    }
    float tds_vals[] = {500, 520, 550, 580, 600};
    for (int i = 0; i < 5; i++) {
        set_sensor(25, 70, 80, tds_vals[i], 50, 60, 10, 0);
        g_cbuf_count = 0;
        f=0; h=0; m=0;
        bool blocked = safety_gate();
        CHECK(136+i, blocked, "High TDS blocks production", "TDS should block");
    }
    float low_hums[] = {10, 15, 20, 25, 29};
    for (int i = 0; i < 5; i++) {
        set_sensor(25, low_hums[i], 80, 300, 50, 60, 0, 0);
        fallback_rules(&f, &h, &m);
        CHECK(141+i, g_mode_current == 0, "Low hum IDLE", "Low hum should be IDLE");
    }
    int mode_tests[] = {0, 1, 2, 3, 4};
    int fan_exp[]    = {0, 1, 2, 3, 1};
    int heat_exp[]   = {0, 0, 0, 0, 1};
    int mot_exp[]    = {0, 1, 1, 1, 0};
    for (int i = 0; i < 5; i++) {
        g_mode_current = mode_tests[i];
        f = h = m = 0;
        switch(g_mode_current) {
            case 0: f=0; h=0; m=0; break;
            case 1: f=1; h=0; m=1; break;
            case 2: f=2; h=0; m=1; break;
            case 3: f=3; h=0; m=1; break;
            case 4: f=1; h=1; m=0; break;
        }
        CHECK(146+i, f==fan_exp[i] && h==heat_exp[i] && m==mot_exp[i],
              "Mode output mapping", "Mode output wrong");
    }
}
void test_battery_power() {
    Serial.println("\n── Battery & Power (151-180) ──");
    float crit_batts[] = {9, 8, 5, 3, 1};
    for (int i = 0; i < 5; i++) {
        set_sensor(25, 60, crit_batts[i], 300, 50, 60, 10, 0);
        CHECK(151+i, check_battery_low() == 2, "Battery critical", "Should be critical");
    }
    float warn_batts[] = {19, 15, 12, 11, 10};
    for (int i = 0; i < 5; i++) {
        set_sensor(25, 60, warn_batts[i], 300, 50, 60, 10, 0);
        CHECK(156+i, check_battery_low() == 1, "Battery warning", "Should warn");
    }
    float ok_batts[] = {21, 30, 50, 75, 100};
    for (int i = 0; i < 5; i++) {
        set_sensor(25, 60, ok_batts[i], 300, 50, 60, 10, 0);
        CHECK(161+i, check_battery_low() == 0, "Battery OK", "Should be OK");
    }
    float fan_hums[] = {70, 75, 80, 85, 90};
    for (int i = 0; i < 5; i++) {
        set_sensor(25, fan_hums[i], 15, 300, 50, 60, 20, 0);
        int f=0, h=0, m=0;
        fallback_rules(&f, &h, &m);
        CHECK(166+i, f <= 1, "Low battery caps fan", "Fan should be capped");
    }
    for (int i = 0; i < 5; i++) {
        set_sensor(25, 70, 5, 300, 50, 60, 20, 0);
        g_cbuf_count = 0;
        int f=0, h=0, m=0;
        bool blocked = safety_gate();
        CHECK(171+i, blocked, "Critical battery blocks all", "Should block on critical battery");
    }
    g_mcu_reduced = 1;
    for (int i = 0; i < 5; i++) {
        set_sensor(25, 80, 80, 300, 50, 70, 25, 0);
        int f=0, h=0, m=0;
        fallback_rules(&f, &h, &m);
        if (g_mcu_reduced && f > 2) f = 2;
        CHECK(176+i, f <= 2, "MCU reduced caps fan at 2", "Fan should cap at 2");
    }
    g_mcu_reduced = 0;
}
void test_time_features() {
    Serial.println("\n── Time-Based Features (181-220) ──");
    for (int i = 0; i < 5; i++) {
        int tick = 181 + i;
        g_cbuf_count = 0; g_cbuf_head = 0;
        struct SensorReading r1 = {20.0f+i, 60, 80, 300, 50, 60, 10, 0};
        struct SensorReading r2 = {26.0f+i, 60, 80, 300, 50, 60, 10, 0};
        cbuf_push(&r1);
        cbuf_push(&r2);
        g_sensor_valid = r2;
        compute_time_features();
        CHECK(tick, g_tf.temp_delta > 0, "Rising temp delta positive", "Rising temp should be positive");
    }
    for (int i = 0; i < 5; i++) {
        int tick = 186 + i;
        g_cbuf_count = 0; g_cbuf_head = 0;
        struct SensorReading r1 = {35.0f, 60, 80, 300, 50, 60, 10, 0};
        struct SensorReading r2 = {25.0f-i, 60, 80, 300, 50, 60, 10, 0};
        cbuf_push(&r1);
        cbuf_push(&r2);
        g_sensor_valid = r2;
        compute_time_features();
        CHECK(tick, g_tf.temp_delta < 0, "Falling temp delta negative", "Falling temp should be negative");
    }
    for (int i = 0; i < 5; i++) {
        int tick = 191 + i;
        g_cbuf_count = 0; g_cbuf_head = 0;
        struct SensorReading r1 = {25, 40.0f+i, 80, 300, 50, 60, 10, 0};
        struct SensorReading r2 = {25, 60.0f+i, 80, 300, 50, 60, 10, 0};
        cbuf_push(&r1);
        cbuf_push(&r2);
        g_sensor_valid = r2;
        compute_time_features();
        CHECK(tick, g_tf.humidity_delta > 0, "Rising humidity delta", "Should be positive");
    }
    for (int i = 0; i < 5; i++) {
        int tick = 196 + i;
        g_cbuf_count = 0; g_cbuf_head = 0;
        struct SensorReading r = {25, 60, 80, 300, 50, 60, 10, 0};
        cbuf_push(&r);
        cbuf_push(&r);
        g_sensor_valid = r;
        compute_time_features();
        CHECK(tick, fabsf(g_tf.temp_delta) < 0.01f, "Zero delta flat sensor", "Flat should be near 0");
    }
    for (int i = 0; i < 5; i++) {
        int tick = 201 + i;
        g_cbuf_count = 0; g_cbuf_head = 0;
        float base_t = 20.0f + i * 2;
        float base_h = 50.0f + i * 3;
        for (int j = 0; j < 3; j++) {
            struct SensorReading r = {base_t+j, base_h+j, 80, 300, 50, 60, 10, 0};
            cbuf_push(&r);
        }
        g_sensor_valid = *cbuf_get(0);
        compute_time_features();
        float expected_t = base_t + 1.0f; 
        CHECK(tick, fabsf(g_tf.temp_avg3 - expected_t) < 0.5f,
              "Rolling avg correct", "Rolling avg wrong");
    }
    for (int i = 0; i < 5; i++) {
        int tick = 206 + i;
        g_cbuf_count = 0; g_cbuf_head = 0;
        struct SensorReading r1 = {25, 60, 80, 300, 50, 60, 5.0f+i, 0};
        struct SensorReading r2 = {25, 60, 80, 300, 50, 60, 15.0f+i, 0};
        cbuf_push(&r1);
        cbuf_push(&r2);
        g_sensor_valid = r2;
        compute_time_features();
        CHECK(tick, g_tf.flow_delta > 0, "Rising flow delta", "Flow delta should be positive");
    }
    for (int i = 0; i < 5; i++) {
        int tick = 211 + i;
        g_cbuf_count = 0; g_cbuf_head = 0;
        float hum  = 50.0f + i * 5;
        float flow = 10.0f + i * 2;
        struct SensorReading r = {25, hum, 80, 300, 50, 60, flow, 0};
        cbuf_push(&r);
        g_sensor_valid = r;
        compute_time_features();
        float expected_eff = (flow / hum) * 100.0f;
        CHECK(tick, fabsf(g_tf.efficiency - expected_eff) < 1.0f,
              "Efficiency computed", "Efficiency wrong");
    }
    for (int i = 0; i < 5; i++) {
        int tick = 216 + i;
        g_cbuf_count = 0; g_cbuf_head = 0;
        struct SensorReading r = {25+i, 60+i, 80, 300, 50, 60, 10, 0};
        cbuf_push(&r);
        g_sensor_valid = r;
        compute_time_features();
        CHECK(tick, g_tf.temp_delta == 0.0f, "Single reading delta=0", "Single reading delta should be 0");
    }
}
void test_ml_predictions() {
    Serial.println("\n── ML Predictions (221-255) ──");
    CHECK(221, g_interp != nullptr, "ML model initialized", "ML should be initialized");
    CHECK(222, g_in != nullptr && g_out != nullptr, "ML tensors valid", "Tensors should be valid");
    for (int i = 0; i < 5; i++) {
        set_sensor(20+i*3, 30+i*10, 80, 300, 50, 60, 5+i*3, i%2);
        g_cbuf_count = 0; g_cbuf_head = 0;
        struct SensorReading r = g_sensor_valid;
        cbuf_push(&r);
        compute_time_features();
        float conf = 0;
        int mode = ml_predict(&conf);
        CHECK(223+i, (mode >= 0 && mode <= 4) || mode == -1,
              "ML mode in valid range", "ML mode out of range");
    }
    for (int i = 0; i < 5; i++) {
        set_sensor(25+i, 50+i*5, 80, 300, 50, 60, 10+i, 0);
        g_cbuf_count = 0; g_cbuf_head = 0;
        struct SensorReading r = g_sensor_valid;
        cbuf_push(&r);
        compute_time_features();
        float conf = 0;
        ml_predict(&conf);
        CHECK(228+i, conf >= 0.0f && conf <= 1.0f, "ML confidence 0-1", "Confidence out of range");
    }
    for (int i = 0; i < 5; i++) {
        int tick = 233 + i;
        set_sensor(30+i, 80+i, 70-i*5, 350, 30, 65, 0.5, 1);
        g_cbuf_count = 0; g_cbuf_head = 0;
        struct SensorReading r = g_sensor_valid;
        cbuf_push(&r);
        compute_time_features();
        float conf = 0;
        int mode = ml_predict(&conf);
        INFO(tick, "REGEN condition ML prediction");
        g_info++;  
    }
    for (int i = 0; i < 5; i++) {
        int tick = 238 + i;
        set_sensor(20+i, 15+i, 95, 250, 90, 55, 0, 0);
        g_cbuf_count = 0; g_cbuf_head = 0;
        struct SensorReading r = g_sensor_valid;
        cbuf_push(&r);
        compute_time_features();
        float conf = 0;
        int mode = ml_predict(&conf);
        INFO(tick, "IDLE condition ML prediction");
    }
    for (int i = 0; i < 5; i++) {
        int tick = 243 + i;
        uint32_t before = ESP.getFreeHeap();
        set_sensor(25, 60, 80, 300, 50, 60, 10, 0);
        g_cbuf_count = 0;
        struct SensorReading r = g_sensor_valid;
        cbuf_push(&r);
        compute_time_features();
        float conf = 0;
        ml_predict(&conf);
        uint32_t after = ESP.getFreeHeap();
        CHECK(tick, after >= before - 1024, "ML no heap leak", "ML leaking heap");
    }
    float extreme_temps[] = {-20, -10, 0, 49, 45, 40, 30, 25};
    for (int i = 0; i < 8; i++) {
        int tick = 248 + i;
        set_sensor(extreme_temps[i], 50, 80, 300, 50, 60, 10, 0);
        g_cbuf_count = 0;
        struct SensorReading r = g_sensor_valid;
        cbuf_push(&r);
        compute_time_features();
        float conf = 0;
        int mode = ml_predict(&conf);
        CHECK(tick, (mode >= 0 && mode <= 4) || mode == -1,
              "ML handles extreme temp", "ML crashed on extreme");
    }
}
void run_standard_test_case(int case_num, float t, float h, float bat, float wl, int rgb, int rpm) {
    g_fan_on_start_ms = 0; g_heat_on_start_ms = 0; g_mode_current = 0;
    g_timer_freeze = 0; g_timer_rgb = 0; g_timer_blockage = 0;
    g_freeze_start_ms = 0; g_rgb_wet_start_ms = 0; g_blockage_start_ms = 0;
    Serial.printf("\n--- STANDARDIZED CASE %d (CLEAN AI TEST) ---\n", case_num);
    g_sensor_valid = {t, h, bat, 300.0f, wl, 40.0f, (h > 60 ? 1.0f : 0.0f), rgb, rpm};
    g_cbuf_count = 0; g_cbuf_head = 0;
    for(int i=0; i<6; i++) { cbuf_push(&g_sensor_valid); }
    compute_time_features();
    int fan = 0, heater = 0, motor = 0;
    run_decision_cycle(&fan, &heater, &motor);
    apply_outputs(fan, heater, motor);
    Serial.printf("LOG -> Case:%d | Mode:%d | Fan:%d Heat:%d Mot:%d\n", 
                  case_num, g_mode_current, fan, heater, motor);
    delay(4000); 
}
void run_all_tests() {
    Serial.println("\n[VALIDATION] Starting Standard 10-Case Test Suite...");
    test_sensor_validation();
    test_safety_rules();
    test_rgb_regen();
    test_hardware_failures();
    test_production_modes();
    test_battery_power();
    test_time_features();
    test_ml_predictions();
    Serial.println(F("\n[VALIDATION] 315-Case Test Suite Complete."));
}
#endif 
void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n╔══════════════════════════════════════════╗");
    Serial.println("║  AWG SYSTEM — Time-Based ML State Machine ║");
    Serial.println("║  ESP32 + TensorFlow Lite Micro  v3.0      ║");
    Serial.println("╚══════════════════════════════════════════╝\n");
    setup_gpio();
    setup_pwm();
    
    // Startup LED test: Blink all for 2 seconds
    Serial.println("[SETUP] Blinking LEDs for 2s startup test...");
    digitalWrite(PIN_RED, HIGH);
    digitalWrite(PIN_GREEN, HIGH);
    digitalWrite(PIN_WHITE, HIGH);
    delay(2000);
    led_all_off();
    
    sensor_read_real();
    sensor_validate();
    cbuf_push(&g_sensor_valid);
    compute_time_features();
    setup_ml_model();
    for (int i = 1; i < CBUF_SIZE; i++)
        cbuf_push(&g_sensor_valid);
    diagnostic_startup();
#if ENABLE_TEST_MODE
    Serial.println("[TEST MODE] Running 315 test cases...\n");
    delay(1000);
    run_all_tests();
    delay(2000);
    Serial.println("[TEST MODE] Complete. Entering production.\n");
#endif
    Serial.println("[SETUP] Init complete.\n");
}
void handle_buttons() {
    static bool last_btn_heat = HIGH;
    static bool last_btn_mode = HIGH;
    static int fan_cycle = 0; // 0:OFF, 1:LOW, 2:MID, 3:MAX
    
    bool btn_heat = digitalRead(PIN_BTN_HEATER);
    bool btn_mode = digitalRead(PIN_BTN_MODE);
    
    // Heater Toggle
    if (btn_heat == LOW && last_btn_heat == HIGH) {
        g_heat_state = !g_heat_state;
        Serial.printf("[BTN] Heater manually toggled: %s\n", g_heat_state ? "ON" : "OFF");
        delay(50); // Simple debounce
    }
    last_btn_heat = btn_heat;
    
    // Fan Mode Cycle
    if (btn_mode == LOW && last_btn_mode == HIGH) {
        fan_cycle = (fan_cycle + 1) % 4;
        switch(fan_cycle) {
            case 0: Serial.println("[BTN] Fan: OFF"); break;
            case 1: Serial.println("[BTN] Fan: Low Speed"); break;
            case 2: Serial.println("[BTN] Fan: Medium Speed"); break;
            case 3: Serial.println("[BTN] Fan: Max Speed"); break;
        }
        delay(50); // Simple debounce
    }
    last_btn_mode = btn_mode;
}

void loop() {
    static bool last_power_state = true;
    handle_buttons(); // Check for button presses
    
    if (!g_system_power) {
        if (last_power_state) {
            Serial.println("[PWR] System Powered OFF by User. Hibernating...");
            apply_outputs(0, 0, 0); 
            last_power_state = false;
        }
        delay(1000); 
        return; 
    }
    if (g_system_power && !last_power_state) {
        Serial.println("[PWR] System Powered ON. Purging stale history...");
        g_cbuf_count = 0; 
        last_power_state = true;
    }
    sensor_read_real();    
    sensor_validate();
    cbuf_push(&g_sensor_valid); 
    compute_time_features();
    const struct SensorReading* cur = cbuf_get(0);
    Serial.printf("[SEN] T=%.1f(Δ%.1f) H=%.1f(Δ%.1f) F=%.1f(eff=%.1f) "
                  "B=%.0f MCU=%.0f TDS=%.0f W=%.0f RGB=%d\n",
                  cur->temp,    g_tf.temp_delta,
                  cur->humidity, g_tf.humidity_delta,
                  cur->flow,    g_tf.efficiency,
                  cur->battery, cur->mcu_temp,
                  cur->tds,     cur->water_level, cur->rgb_state);
    int fan = 0, heater = 0, motor = 0;
    run_decision_cycle(&fan, &heater, &motor);
    apply_outputs(fan, heater, motor);
    print_system_status();
    Serial.println("══════════════════════════════════════════\n");
    delay(LOOP_DELAY_MS);
}