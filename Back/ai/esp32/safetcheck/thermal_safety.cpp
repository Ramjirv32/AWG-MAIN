#include "statemachine.h"
int check_thermal_safety(int* motor_throttle_pwm) {
    uint32_t now = millis();
    float mcu_t = g_sensor_valid.mcu_temp;
    if (g_mcu_shutdown && mcu_t <= 60.0f) {
        g_mcu_shutdown = false;
        g_mcu_warning_start_ms = 0;
        g_mcu_critical_start_ms = 0;
        Serial.println(F("[SAFETY] MCU RECOVERY: System cool again"));
    }
    if (mcu_t >= 75.0f) {
        if (g_mcu_warning_start_ms == 0) g_mcu_warning_start_ms = now;
        uint32_t warn_duration = now - g_mcu_warning_start_ms;
        if (mcu_t >= 85.0f && warn_duration >= 60000) {
            if (g_mcu_critical_start_ms == 0) g_mcu_critical_start_ms = now;
            uint32_t crit_duration = now - g_mcu_critical_start_ms;
            if (crit_duration >= 20000) { 
                if (crit_duration >= 60000) { 
                    g_mcu_shutdown = true;
                    Serial.println(F("[SAFETY] MCU CRITICAL: Forced Shutdown after 60s sustained overheat"));
                    return 2; 
                }
                *motor_throttle_pwm = 80; 
                Serial.println(F("[SAFETY] MCU CRITICAL: Sustained 85C (>20s), throttling MIN"));
                return 1;
            }
        }
        if (warn_duration >= 60000) {
            *motor_throttle_pwm = 150; 
            Serial.println(F("[SAFETY] MCU WARNING: Sustained 75C, throttling LOW"));
            return 1;
        }
    } else {
        g_mcu_warning_start_ms = 0;
        g_mcu_critical_start_ms = 0;
    }
    return g_mcu_shutdown ? 2 : 0;
}
