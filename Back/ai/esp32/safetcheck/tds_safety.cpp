#include "statemachine.h"
uint32_t g_tds_warn_start_ms = 0;
uint32_t g_tds_crit_start_ms = 0;
int check_tds_safety() {
    uint32_t now = millis();
    float tds = g_sensor_valid.tds;
    if (tds >= 1000.0f) {
        if (g_tds_crit_start_ms == 0) g_tds_crit_start_ms = now;
        if (now - g_tds_crit_start_ms >= 45000) {
            Serial.println(F("[SAFETY] TDS CRITICAL: Sustained high TDS (>45s) -> Shutdown"));
            return 2;
        }
    } else {
        g_tds_crit_start_ms = 0;
    }
    if (tds >= 500.0f) {
        if (g_tds_warn_start_ms == 0) g_tds_warn_start_ms = now;
        if (now - g_tds_warn_start_ms >= 60000) {
            Serial.println(F("[SAFETY] TDS WARNING: Sustained TDS (>60s) -> Mode Reduction"));
            return 1;
        }
    } else {
        g_tds_warn_start_ms = 0;
    }
    return 0; 
}
