#ifndef STATEMACHINE_H
#define STATEMACHINE_H
#include <Arduino.h>
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
struct TimeFeatures {
    float temp_delta;
    float humidity_delta;
    float flow_delta;
    float temp_avg3;
    float humidity_avg3;
    float flow_avg3;
    float efficiency;
};
extern const float FLOW_MIN_THRESHOLD;
extern const uint32_t STARTUP_DELAY_MS;
extern const uint32_t NO_FLOW_TIMEOUT_MS;
extern const uint32_t LOOP_DELAY_MS;
extern struct SensorReading g_sensor_valid;
extern struct TimeFeatures g_tf;
extern int8_t g_mode_current;
extern int8_t g_motor_state;
extern int8_t g_fan_state;
extern int8_t g_heat_state;
extern uint32_t g_rgb_wet_start_ms;
extern uint32_t g_fan_on_start_ms;
extern bool g_mcu_shutdown;
extern uint32_t g_mcu_warning_start_ms;
extern uint32_t g_mcu_critical_start_ms;
bool is_startup_phase();
#endif
