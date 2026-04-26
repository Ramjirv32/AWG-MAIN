#include "statemachine.h"
uint32_t g_bat_crit_start_ms = 0;
bool check_battery_critical() {
    if (g_sensor_valid.battery < 20.0f) {
        if (g_bat_crit_start_ms == 0) g_bat_crit_start_ms = millis();
        if (millis() - g_bat_crit_start_ms >= 120000) { 
            Serial.println(F("[SAFETY] BATTERY CRITICAL: Sustained low power (>2 min) confirmed"));
            return true;
        }
    } else {
        g_bat_crit_start_ms = 0;
    }
    return false;
}
