#include <Arduino.h>
#include "statemachine.h"
uint32_t g_mcu_warning_start_ms = 0;
uint32_t g_mcu_critical_start_ms = 0;
bool g_mcu_shutdown = false;
int check_mcu_temperature(int* motor, int* heater) {
    uint32_t now = millis();
    float mcu_t = g_sensor_valid.mcu_temp;
    if (g_mcu_shutdown && mcu_t <= 60.0f) {
        Serial.println(F("[THERMAL] MCU Cooled below 60C. Resuming safety restart..."));
        g_mcu_shutdown = false;
        g_mcu_warning_start_ms = 0;
        g_mcu_critical_start_ms = 0;
    }
    if (mcu_t >= 75.0f) {
        if (g_mcu_warning_start_ms == 0) g_mcu_warning_start_ms = now;
        uint32_t warn_duration = now - g_mcu_warning_start_ms;
        if (mcu_t >= 85.0f && warn_duration >= 60000) {
            if (g_mcu_critical_start_ms == 0) g_mcu_critical_start_ms = now;
            uint32_t crit_duration = now - g_mcu_critical_start_ms;
            if (crit_duration >= 30000) {
                *motor = 0;
                *heater = 0;
                if (crit_duration >= 60000) {
                    g_mcu_shutdown = true;
                    return 2;
                }
                return 1;
            }
        }
        if (warn_duration >= 60000) {
            *heater = 0;
            return 1;
        }
    } else {
        g_mcu_warning_start_ms = 0;
        g_mcu_critical_start_ms = 0;
    }
    if (g_mcu_shutdown) return 2;
    return 0;
}
