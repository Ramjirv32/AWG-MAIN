/*
╔════════════════════════════════════════════════════════════╗
║   AWG MILITARY PRODUCTION FIRMWARE                         ║
║   3-Neural Network AI Control System                       ║
║   ESP32 | TFLite | 3 Models | OLED Display                ║
║   Production Ready                                         ║
╚════════════════════════════════════════════════════════════╝
*/

#include <Arduino.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Wire.h>

// TensorFlow Lite
#include "tensorflow/lite/micro/all_ops_resolver.h"
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/schema/schema_generated.h"

// ML Models
#include "flow_model.h"
#include "silica_model.h"
#include "decision_model.h"
#include "model_config.h"

// ============================================================
// PIN DEFINITIONS
// ============================================================
#define DHTPIN          15      // DHT11 sensor
#define DHT_TYPE        DHT11
#define ONE_WIRE_PIN    2       // DS18B20 (heater sensor)
#define RELAY_PIN       16      // Heater relay
#define SWITCH_PIN      17      // Manual override button
#define LED_STATUS      5       // Status LED
#define LED_AI          27      // AI decision indicator
#define WATER_LEVEL_PIN 34      // Analog - water level
#define TDS_PIN         35      // Analog - water quality
#define RGB_RED_PIN     26      // RGB sensor red
#define RGB_GREEN_PIN   25      // RGB sensor green
#define RGB_BLUE_PIN    14      // RGB sensor blue

// ============================================================
// OBJECTS & SENSORS
// ============================================================
DHT dht(DHTPIN, DHT_TYPE);
OneWire oneWire(ONE_WIRE_PIN);
DallasTemperature tempSensor(&oneWire);
Adafruit_SSD1306 display(128, 64, &Wire, -1);

// ============================================================
// ML INTERPRETER OBJECTS
// ============================================================
tflite::MicroInterpreter *flowInterpreter = nullptr;
tflite::MicroInterpreter *silicaInterpreter = nullptr;
tflite::MicroInterpreter *decisionInterpreter = nullptr;

TfLiteTensor *flowInput = nullptr, *flowOutput = nullptr;
TfLiteTensor *silicaInput = nullptr, *silicaOutput = nullptr;
TfLiteTensor *decisionInput = nullptr, *decisionOutput = nullptr;

uint8_t tensorArena[ARENA_SIZE];
tflite::AllOpsResolver resolver;

// ============================================================
// GLOBAL SENSOR DATA
// ============================================================
struct SensorData {
    float temperature = 0;      // DHT11
    float humidity = 0;         // DHT11
    float heater_temp = 0;      // DS18B20
    int water_level = 0;        // ADC 0-4095
    int tds_ppm = 0;            // ADC converted to PPM
    int rgb_r = 0;              // ADC
    int rgb_g = 0;              // ADC
    int rgb_b = 0;              // ADC
} sensor_data;

// ============================================================
// AI PREDICTIONS
// ============================================================
struct AIPredictions {
    float flow_ml_per_hour = 0;
    float silica_percent = 0;
    bool should_produce = false;
    float confidence_flow = 0;
    float confidence_silica = 0;
    float confidence_decision = 0;
} ai_predictions;

// ============================================================
// SYSTEM STATE
// ============================================================
struct SystemState {
    bool relay_active = false;
    bool manual_override = false;
    uint32_t last_update_ms = 0;
    uint32_t last_ml_run_ms = 0;
    int error_count = 0;
    char status_msg[32] = "INIT";
} system_state;

// ============================================================
// SETUP: Initialize ML Models
// ============================================================
void setup_ml_models() {
    Serial.println("[ML] Initializing TensorFlow Lite Micro...");
    
    // Flow Model
    const tflite::Model* flowModel = tflite::GetModel(flow_model_tflite);
    if (!flowModel) {
        Serial.println("[ERROR] Flow model failed to load");
        return;
    }
    
    static tflite::MicroInterpreter flowInt(
        flowModel, resolver, tensorArena, ARENA_SIZE
    );
    flowInterpreter = &flowInt;
    
    if (flowInterpreter->AllocateTensors() != kTfLiteOk) {
        Serial.println("[ERROR] Flow model allocation failed");
        return;
    }
    flowInput = flowInterpreter->input(0);
    flowOutput = flowInterpreter->output(0);
    Serial.println("[ML] ✅ Flow model ready");
    
    // Silica Model
    const tflite::Model* silicaModel = tflite::GetModel(silica_model_tflite);
    if (!silicaModel) {
        Serial.println("[ERROR] Silica model failed to load");
        return;
    }
    
    static tflite::MicroInterpreter silicaInt(
        silicaModel, resolver, tensorArena, ARENA_SIZE
    );
    silicaInterpreter = &silicaInt;
    
    if (silicaInterpreter->AllocateTensors() != kTfLiteOk) {
        Serial.println("[ERROR] Silica model allocation failed");
        return;
    }
    silicaInput = silicaInterpreter->input(0);
    silicaOutput = silicaInterpreter->output(0);
    Serial.println("[ML] ✅ Silica model ready");
    
    // Decision Model
    const tflite::Model* decisionModel = tflite::GetModel(decision_model_tflite);
    if (!decisionModel) {
        Serial.println("[ERROR] Decision model failed to load");
        return;
    }
    
    static tflite::MicroInterpreter decisionInt(
        decisionModel, resolver, tensorArena, ARENA_SIZE
    );
    decisionInterpreter = &decisionInt;
    
    if (decisionInterpreter->AllocateTensors() != kTfLiteOk) {
        Serial.println("[ERROR] Decision model allocation failed");
        return;
    }
    decisionInput = decisionInterpreter->input(0);
    decisionOutput = decisionInterpreter->output(0);
    Serial.println("[ML] ✅ Decision model ready");
}

// ============================================================
// NORMALIZE INPUT
// ============================================================
float normalize_value(float value, float mean, float std) {
    return (value - mean) / std;
}

// ============================================================
// INFERENCE: FLOW PREDICTION
// ============================================================
void predict_flow() {
    if (!flowInterpreter || !flowInput || !flowOutput) return;
    
    // Prepare input (normalize)
    float input_data[3] = {
        normalize_value(sensor_data.temperature, FLOW_MEAN[0], FLOW_STD[0]),
        normalize_value(sensor_data.humidity, FLOW_MEAN[1], FLOW_STD[1]),
        normalize_value(sensor_data.water_level, FLOW_MEAN[2], FLOW_STD[2])
    };
    
    // Copy to model input
    memcpy(flowInput->data.f, input_data, sizeof(input_data));
    
    // Run inference
    if (flowInterpreter->Invoke() != kTfLiteOk) {
        Serial.println("[ERROR] Flow inference failed");
        return;
    }
    
    ai_predictions.flow_ml_per_hour = flowOutput->data.f[0];
    ai_predictions.flow_ml_per_hour = constrain(ai_predictions.flow_ml_per_hour, 0, 500);
    
    Serial.printf("[ML-Flow] %.1f ml/hour\n", ai_predictions.flow_ml_per_hour);
}

// ============================================================
// INFERENCE: SILICA PREDICTION
// ============================================================
void predict_silica() {
    if (!silicaInterpreter || !silicaInput || !silicaOutput) return;
    
    // Prepare input (normalize RGB)
    float input_data[3] = {
        normalize_value(sensor_data.rgb_r, SILICA_MEAN[0], SILICA_STD[0]),
        normalize_value(sensor_data.rgb_g, SILICA_MEAN[1], SILICA_STD[1]),
        normalize_value(sensor_data.rgb_b, SILICA_MEAN[2], SILICA_STD[2])
    };
    
    // Copy to model input
    memcpy(silicaInput->data.f, input_data, sizeof(input_data));
    
    // Run inference
    if (silicaInterpreter->Invoke() != kTfLiteOk) {
        Serial.println("[ERROR] Silica inference failed");
        return;
    }
    
    ai_predictions.silica_percent = silicaOutput->data.f[0];
    ai_predictions.silica_percent = constrain(ai_predictions.silica_percent, 0, 100);
    
    Serial.printf("[ML-Silica] %.1f%%\n", ai_predictions.silica_percent);
}

// ============================================================
// INFERENCE: DECISION PREDICTION
// ============================================================
void predict_decision() {
    if (!decisionInterpreter || !decisionInput || !decisionOutput) return;
    
    // Prepare input (normalize)
    float input_data[3] = {
        normalize_value(sensor_data.temperature, DECISION_MEAN[0], DECISION_STD[0]),
        normalize_value(sensor_data.humidity, DECISION_MEAN[1], DECISION_STD[1]),
        normalize_value(ai_predictions.silica_percent, DECISION_MEAN[2], DECISION_STD[2])
    };
    
    // Copy to model input
    memcpy(decisionInput->data.f, input_data, sizeof(input_data));
    
    // Run inference
    if (decisionInterpreter->Invoke() != kTfLiteOk) {
        Serial.println("[ERROR] Decision inference failed");
        return;
    }
    
    float decision_confidence = decisionOutput->data.f[0];
    ai_predictions.confidence_decision = decision_confidence;
    ai_predictions.should_produce = (decision_confidence > 0.5f);
    
    Serial.printf("[ML-Decision] %s (confidence: %.2f)\n",
        ai_predictions.should_produce ? "PRODUCE" : "WAIT",
        decision_confidence
    );
}

// ============================================================
// RUN ALL INFERENCES
// ============================================================
void run_ml_inference() {
    uint32_t now = millis();
    
    // Run ML every 5 seconds
    if (now - system_state.last_ml_run_ms < 5000) return;
    system_state.last_ml_run_ms = now;
    
    Serial.println("\n[ML] Running inference...");
    
    predict_flow();
    predict_silica();
    predict_decision();
    
    Serial.println("[ML] ✅ Inference complete");
}

// ============================================================
// READ SENSORS
// ============================================================
void read_sensors() {
    // DHT11 (Temperature & Humidity)
    sensor_data.temperature = dht.readTemperature();
    sensor_data.humidity = dht.readHumidity();
    
    if (isnan(sensor_data.temperature) || isnan(sensor_data.humidity)) {
        Serial.println("[WARN] DHT read failed");
    }
    
    // DS18B20 (Heater temperature)
    tempSensor.requestTemperatures();
    sensor_data.heater_temp = tempSensor.getTempCByIndex(0);
    
    // Water Level (ADC)
    sensor_data.water_level = analogRead(WATER_LEVEL_PIN);
    
    // TDS (Water Quality - convert ADC to PPM)
    int tds_raw = analogRead(TDS_PIN);
    float tds_voltage = (tds_raw / 4095.0f) * 3.3f;
    sensor_data.tds_ppm = (int)((tds_voltage / 2.3f) * 1000.0f);
    sensor_data.tds_ppm = constrain(sensor_data.tds_ppm, 0, 2000);
    
    // RGB Sensor (ADC)
    sensor_data.rgb_r = analogRead(RGB_RED_PIN);
    sensor_data.rgb_g = analogRead(RGB_GREEN_PIN);
    sensor_data.rgb_b = analogRead(RGB_BLUE_PIN);
    
    Serial.printf("[SENSOR] T=%.1f°C H=%.0f%% TDS=%d PPM Level=%d\n",
        sensor_data.temperature,
        sensor_data.humidity,
        sensor_data.tds_ppm,
        sensor_data.water_level
    );
}

// ============================================================
// CONTROL RELAY (Heater)
// ============================================================
void update_relay_control() {
    bool should_activate = false;
    
    // Manual override
    if (system_state.manual_override) {
        should_activate = (digitalRead(SWITCH_PIN) == LOW);
    } else {
        // AI decides
        should_activate = ai_predictions.should_produce && (system_state.error_count == 0);
    }
    
    // Safety checks
    if (sensor_data.temperature > 50) should_activate = false;  // Overheat
    if (sensor_data.tds_ppm > 1000) should_activate = false;    // Water too contaminated
    if (sensor_data.water_level < 100) should_activate = false; // Low water
    
    // Apply relay state
    if (should_activate != system_state.relay_active) {
        digitalWrite(RELAY_PIN, should_activate ? HIGH : LOW);
        system_state.relay_active = should_activate;
        
        Serial.printf("[RELAY] %s\n", should_activate ? "ON" : "OFF");
    }
}

// ============================================================
// UPDATE STATUS LEDs
// ============================================================
void update_status_leds() {
    // Status LED: Blink if error
    static uint32_t led_timer = 0;
    if (system_state.error_count > 0) {
        if (millis() - led_timer > 500) {
            digitalWrite(LED_STATUS, !digitalRead(LED_STATUS));
            led_timer = millis();
        }
    } else {
        digitalWrite(LED_STATUS, HIGH);
    }
    
    // AI Decision LED
    digitalWrite(LED_AI, ai_predictions.should_produce ? HIGH : LOW);
}

// ============================================================
// DISPLAY OLED
// ============================================================
void update_display() {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    
    // Header
    display.println("=== AWG AI CONTROL ===");
    display.println();
    
    // Row 1: Temperature
    display.printf("TEMP: %.1f C  ", sensor_data.temperature);
    display.printf("HUM: %.0f%%\n", sensor_data.humidity);
    
    // Row 2: Water Quality
    display.printf("TDS:  %d ppm  ", sensor_data.tds_ppm);
    display.printf("LVL: %d\n", sensor_data.water_level);
    
    // Row 3: AI Predictions
    display.printf("FLOW: %.0f ml/h\n", ai_predictions.flow_ml_per_hour);
    display.printf("SILICA: %.1f%%\n", ai_predictions.silica_percent);
    
    // Row 4: Status
    display.println();
    display.printf("RELAY: %s | AI: %s\n",
        system_state.relay_active ? "ON " : "OFF",
        ai_predictions.should_produce ? "PROD" : "WAIT"
    );
    
    // Row 5: Decision confidence
    display.printf("CONF: %.1f%% | ERR: %d\n",
        ai_predictions.confidence_decision * 100.0f,
        system_state.error_count
    );
    
    display.display();
}

// ============================================================
// HANDLE BUTTON INPUT
// ============================================================
void handle_buttons() {
    static uint32_t last_press = 0;
    
    if (millis() - last_press < 500) return;  // Debounce
    
    if (digitalRead(SWITCH_PIN) == LOW) {
        system_state.manual_override = !system_state.manual_override;
        last_press = millis();
        
        Serial.printf("[BUTTON] Manual override: %s\n",
            system_state.manual_override ? "ON" : "OFF"
        );
    }
}

// ============================================================
// SETUP
// ============================================================
void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("\n\n╔════════════════════════════════════╗");
    Serial.println("║  AWG MILITARY FIRMWARE v2.0        ║");
    Serial.println("║  3-Model AI Control System         ║");
    Serial.println("╚════════════════════════════════════╝");
    
    // GPIO Setup
    pinMode(RELAY_PIN, OUTPUT);
    pinMode(SWITCH_PIN, INPUT_PULLUP);
    pinMode(LED_STATUS, OUTPUT);
    pinMode(LED_AI, OUTPUT);
    digitalWrite(RELAY_PIN, LOW);
    digitalWrite(LED_STATUS, LOW);
    digitalWrite(LED_AI, LOW);
    
    // I2C & Display
    Wire.begin(21, 22);  // SDA, SCL
    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println("[WARN] OLED not detected (continuing anyway)");
    } else {
        display.clearDisplay();
        display.setTextSize(1);
        display.setTextColor(SSD1306_WHITE);
        display.setCursor(0, 0);
        display.println("AWG BOOTING...");
        display.display();
    }
    
    // Sensors
    dht.begin();
    tempSensor.begin();
    
    // ML Models
    setup_ml_models();
    
    Serial.println("\n[SYSTEM] ✅ Setup complete!");
    delay(500);
}

// ============================================================
// MAIN LOOP
// ============================================================
void loop() {
    uint32_t now = millis();
    system_state.last_update_ms = now;
    
    // Read sensors (every 1 second)
    static uint32_t sensor_timer = 0;
    if (now - sensor_timer > 1000) {
        read_sensors();
        sensor_timer = now;
    }
    
    // Run ML inference (every 5 seconds)
    run_ml_inference();
    
    // Update outputs
    update_relay_control();
    update_status_leds();
    update_display();
    
    // Handle button
    handle_buttons();
    
    delay(100);
}
