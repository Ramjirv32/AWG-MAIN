#include "statemachine.h"
uint32_t g_leak_start_ms = 0;
bool check_leak_safety() {
    if (g_cbuf_count < 2) return false;
    uint32_t now = millis();
    float cur_level = g_sensor_valid.water_level;
    float prev_level = cbuf_get(1)->water_level; 
    float drop_rate = prev_level - cur_level;
    if (drop_rate > 0.8f) { 
        if (g_leak_start_ms == 0) g_leak_start_ms = now;
        uint32_t duration = now - g_leak_start_ms;
        if (duration > 180000 && g_sensor_valid.flow < FLOW_MIN_THRESHOLD) {
            Serial.println(F("[SAFETY] LEAK DETECTED: Unrestricted water loss!"));
            return true;
        }
    } else {
        g_leak_start_ms = 0;
    }
    return false;
}
