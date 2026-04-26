#include "statemachine.h"
uint32_t g_instant_freeze_start_ms = 0;
uint32_t g_freeze_start_ms = 0;
int check_freeze_safety() {
    if (is_startup_phase()) return 0;
    uint32_t now = millis();
    if (g_sensor_valid.temp <= -2.0f) {
        if (g_instant_freeze_start_ms == 0) g_instant_freeze_start_ms = now;
        if (now - g_instant_freeze_start_ms >= 120000) { 
            Serial.println(F("[SAFETY] INSTANT FREEZE: -2C sustained (>2 min)confirmed"));
            return 1;
        }
    } else {
        g_instant_freeze_start_ms = 0;
    }
    if (g_sensor_valid.temp <= 0.0f) {
        if (g_freeze_start_ms == 0) g_freeze_start_ms = now;
        if (now - g_freeze_start_ms > 600000) return 1; 
    } else {
        g_freeze_start_ms = 0;
    }
    return 0;
}
