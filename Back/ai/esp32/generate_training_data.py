#!/usr/bin/env python3
"""
AWG Training Data Generator
Generates realistic sensor data for ML model training
Creates: realml_realworld_v2.csv
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import random

print("🚀 Generating AWG Training Dataset...")

# ===========================
# CONFIGURATION
# ===========================
NUM_SAMPLES = 2000
START_DATE = datetime(2025, 1, 1, 0, 0, 0)

# ===========================
# MODE DEFINITIONS
# ===========================
MODE_NAMES = {
    0: "IDLE",
    1: "LOW",
    2: "NORMAL",
    3: "HIGH",
    4: "REGEN"
}

# ===========================
# SENSOR CHARACTERISTICS BY MODE
# ===========================
MODE_PROFILES = {
    0: {  # IDLE
        "temp_range": (20, 25),
        "humidity_range": (40, 50),
        "flow_range": (0, 0.5),
        "tds_range": (100, 200),
        "battery_range": (80, 100),
        "water_level_range": (70, 100),
        "mcu_temp_range": (35, 45),
        "rgb_state": 0,
        "frequency": 0.20  # 20% of dataset
    },
    1: {  # LOW
        "temp_range": (22, 28),
        "humidity_range": (50, 65),
        "flow_range": (1, 3),
        "tds_range": (150, 250),
        "battery_range": (60, 80),
        "water_level_range": (50, 80),
        "mcu_temp_range": (40, 50),
        "rgb_state": 0,
        "frequency": 0.25
    },
    2: {  # NORMAL
        "temp_range": (24, 32),
        "humidity_range": (55, 75),
        "flow_range": (3, 8),
        "tds_range": (200, 350),
        "battery_range": (50, 75),
        "water_level_range": (40, 70),
        "mcu_temp_range": (45, 55),
        "rgb_state": 0,
        "frequency": 0.30
    },
    3: {  # HIGH
        "temp_range": (28, 38),
        "humidity_range": (65, 85),
        "flow_range": (8, 15),
        "tds_range": (300, 450),
        "battery_range": (40, 70),
        "water_level_range": (30, 60),
        "mcu_temp_range": (50, 65),
        "rgb_state": 0,
        "frequency": 0.15
    },
    4: {  # REGEN
        "temp_range": (20, 26),
        "humidity_range": (30, 50),
        "flow_range": (5, 12),
        "tds_range": (50, 150),
        "battery_range": (70, 95),
        "water_level_range": (20, 50),
        "mcu_temp_range": (40, 50),
        "rgb_state": 1,
        "frequency": 0.10
    }
}

# ===========================
# DATA GENERATION
# ===========================
data = []
timestamp = START_DATE

# Calculate sample counts per mode
mode_counts = {}
for mode, profile in MODE_PROFILES.items():
    mode_counts[mode] = int(NUM_SAMPLES * profile["frequency"])

# Shuffle mode order for realistic distribution
modes_list = []
for mode, count in mode_counts.items():
    modes_list.extend([mode] * count)
random.shuffle(modes_list)

# Generate samples
for i, mode in enumerate(modes_list[:NUM_SAMPLES]):
    profile = MODE_PROFILES[mode]
    
    # Generate sensor readings with small noise
    temp = np.random.uniform(*profile["temp_range"]) + np.random.normal(0, 0.5)
    humidity = np.random.uniform(*profile["humidity_range"]) + np.random.normal(0, 1.0)
    flow = np.random.uniform(*profile["flow_range"]) + np.random.normal(0, 0.2)
    tds = np.random.uniform(*profile["tds_range"]) + np.random.normal(0, 10)
    battery = np.random.uniform(*profile["battery_range"]) + np.random.normal(0, 2)
    water_level = np.random.uniform(*profile["water_level_range"]) + np.random.normal(0, 2)
    mcu_temp = np.random.uniform(*profile["mcu_temp_range"]) + np.random.normal(0, 1)
    rgb_state = profile["rgb_state"]
    
    # Clamp values to valid ranges
    temp = np.clip(temp, -20, 80)
    humidity = np.clip(humidity, 0, 100)
    flow = np.clip(flow, 0, 50)
    tds = np.clip(tds, 0, 1000)
    battery = np.clip(battery, 0, 100)
    water_level = np.clip(water_level, 0, 100)
    mcu_temp = np.clip(mcu_temp, 0, 100)
    
    # High confidence for generated data
    confidence_human = np.random.uniform(0.75, 1.0)
    
    data.append({
        "timestamp": timestamp.isoformat(),
        "temp": temp,
        "humidity": humidity,
        "battery": battery,
        "tds": tds,
        "water_level": water_level,
        "mcu_temp": mcu_temp,
        "flow": flow,
        "rgb_state": rgb_state,
        "target_mode": mode,
        "confidence_human": confidence_human,
        "mode_name": MODE_NAMES[mode]
    })
    
    # Increment timestamp by 10 seconds (match ESP32 LOOP_DELAY_MS)
    timestamp += timedelta(seconds=10)

# ===========================
# CREATE DATAFRAME
# ===========================
df = pd.DataFrame(data)

# ===========================
# STATISTICS
# ===========================
print("\n" + "="*60)
print("📊 DATASET STATISTICS")
print("="*60)
print(f"\nTotal Samples: {len(df)}")
print(f"Date Range: {df['timestamp'].min()} to {df['timestamp'].max()}")
print(f"\nMode Distribution:")
print(df["target_mode"].value_counts().sort_index())
print("\nMode Names:")
for mode, name in MODE_NAMES.items():
    count = len(df[df["target_mode"] == mode])
    pct = 100 * count / len(df)
    print(f"  {mode}: {name:10s} = {count:4d} samples ({pct:5.1f}%)")

print("\n" + "="*60)
print("📈 SENSOR RANGES")
print("="*60)
for col in ["temp", "humidity", "battery", "tds", "water_level", "mcu_temp", "flow"]:
    min_val = df[col].min()
    max_val = df[col].max()
    mean_val = df[col].mean()
    print(f"{col:15s}: min={min_val:7.2f}, max={max_val:7.2f}, mean={mean_val:7.2f}")

print("\nConfidence Distribution:")
print(f"  Min:  {df['confidence_human'].min():.3f}")
print(f"  Mean: {df['confidence_human'].mean():.3f}")
print(f"  Max:  {df['confidence_human'].max():.3f}")

print("\nRGB State Distribution:")
print(f"  State 0 (Normal): {len(df[df['rgb_state'] == 0])} samples")
print(f"  State 1 (Regen):  {len(df[df['rgb_state'] == 1])} samples")

# ===========================
# SAVE TO CSV
# ===========================
CSV_FILE = "realml_realworld_v2.csv"
df.to_csv(CSV_FILE, index=False)

print("\n" + "="*60)
print(f"✅ Dataset saved to: {CSV_FILE}")
print(f"   File size: {np.format_float_positional(len(str(df))/1024, 3)} KB")
print("="*60)

# ===========================
# MODE-BY-MODE BREAKDOWN
# ===========================
print("\n" + "="*60)
print("🎯 MODE SENSOR CHARACTERISTICS")
print("="*60)

for mode in range(5):
    mode_data = df[df["target_mode"] == mode]
    print(f"\n{MODE_NAMES[mode]:10s} (n={len(mode_data):4d}):")
    print(f"  Temp:       {mode_data['temp'].mean():6.2f} ± {mode_data['temp'].std():5.2f}°C")
    print(f"  Humidity:   {mode_data['humidity'].mean():6.2f} ± {mode_data['humidity'].std():5.2f}%")
    print(f"  Flow:       {mode_data['flow'].mean():6.2f} ± {mode_data['flow'].std():5.2f} LPM")
    print(f"  TDS:        {mode_data['tds'].mean():6.2f} ± {mode_data['tds'].std():5.2f} ppm")
    print(f"  Water Level:{mode_data['water_level'].mean():6.2f} ± {mode_data['water_level'].std():5.2f}%")
    print(f"  Battery:    {mode_data['battery'].mean():6.2f} ± {mode_data['battery'].std():5.2f}%")

print("\n" + "="*60)
print("✨ Ready to train! Run: python train.py")
print("="*60)

# Show first few rows
print("\n📋 First 5 samples:")
print(df.head().to_string())

print("\n✅ Data generation complete!")
