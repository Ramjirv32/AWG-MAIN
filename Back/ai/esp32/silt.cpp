#include <Arduino.h>
#include "statemachine.h"
uint32_t g_no_flow_start_ms = 0;
uint32_t g_motor_on_start_ms = 0;
void handle_flow_analysis(float flow, float hum, int* heater_out, int* motor_out, int* fan_out, int* mode_current) {
    uint32_t now = millis();
    if (g_motor_state == 1) {
        if (g_motor_on_start_ms == 0) g_motor_on_start_ms = now;
        if (flow < FLOW_MIN_THRESHOLD) {
            if (g_no_flow_start_ms == 0) g_no_flow_start_ms = now;
            uint32_t motor_on_time = now - g_motor_on_start_ms;
            uint32_t no_flow_time = now - g_no_flow_start_ms;
            if (motor_on_time > STARTUP_DELAY_MS && no_flow_time > NO_FLOW_TIMEOUT_MS) {
                if (hum > 60.0f && g_rgb_wet_start_ms != 0 && (now - g_rgb_wet_start_ms > 1200000)) {
                    *heater_out = 1;
                    *motor_out = 0;
                    *mode_current = 4;
                    return;
                }
                else if (hum < 50.0f) {
                    *motor_out = 0;
                    *fan_out = 1;
                    *mode_current = 0;
                    return;
                }
                else if (g_sensor_valid.rgb_state == 0 && hum > 60.0f) {
                    *mode_current = -1;
                    return;
                }
            }
        } else {
            g_no_flow_start_ms = 0;
        }
    } else {
        g_motor_on_start_ms = 0;
        g_no_flow_start_ms = 0;
    }
}
