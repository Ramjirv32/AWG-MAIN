#!/usr/bin/env python3
"""
AWG Multi-Model Training Pipeline
3 Neural Networks: Flow, Silica, Decision
Ready for ESP32 TFLite deployment
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
from sklearn.preprocessing import StandardScaler
import os

print("🚀 AWG Multi-Model Training Pipeline")
print("="*60)

# ============================================================
# 1️⃣  FLOW PREDICTION MODEL
# ============================================================
print("\n[1/3] Training FLOW MODEL...")

# Synthetic training data (temp, humidity, water_level -> flow rate)
np.random.seed(42)
temp_data = np.random.uniform(15, 50, 2000)
humidity_data = np.random.uniform(20, 95, 2000)
water_level_data = np.random.uniform(50, 900, 2000)

# Physics-based synthetic target: Flow = f(temp, humidity, water_level)
flow_target = (
    (humidity_data * 2.5) -
    (temp_data * 1.2) +
    (water_level_data * 0.02) +
    np.random.normal(0, 5, 2000)
)
flow_target = np.clip(flow_target, 0, 500)

X_flow = np.column_stack((temp_data, humidity_data, water_level_data)).astype(np.float32)
y_flow = flow_target.astype(np.float32).reshape(-1, 1)

# Normalize
scaler_flow = StandardScaler()
X_flow_scaled = scaler_flow.fit_transform(X_flow)

# Train-test split
n_train = int(len(X_flow) * 0.8)
X_flow_train = X_flow_scaled[:n_train].astype(np.float32)
y_flow_train = y_flow[:n_train].astype(np.float32)
X_flow_test = X_flow_scaled[n_train:].astype(np.float32)
y_flow_test = y_flow[n_train:].astype(np.float32)

# Build flow model
flow_model = keras.Sequential([
    layers.Input(shape=(3,)),
    layers.Dense(32, activation='relu'),
    layers.BatchNormalization(),
    layers.Dropout(0.2),
    layers.Dense(16, activation='relu'),
    layers.Dropout(0.2),
    layers.Dense(8, activation='relu'),
    layers.Dense(1)  # Regression output
], name="flow_model")

flow_model.compile(optimizer=keras.optimizers.Adam(1e-3), loss='mse', metrics=['mae'])
flow_model.fit(
    X_flow_train, y_flow_train,
    validation_split=0.2,
    epochs=100,
    batch_size=32,
    verbose=0
)

flow_loss_test = flow_model.evaluate(X_flow_test, y_flow_test, verbose=0)
print(f"✅ Flow Model - Test MSE: {flow_loss_test[0]:.4f}, MAE: {flow_loss_test[1]:.4f}")

# Save mean/std for C++ normalization
print(f"   Normalization params (copy to ESP32):")
print(f"   flow_mean = {list(scaler_flow.mean_)}")
print(f"   flow_std = {list(scaler_flow.scale_)}")

# ============================================================
# 2️⃣  SILICA % MODEL
# ============================================================
print("\n[2/3] Training SILICA MODEL...")

# Synthetic data (RGB sensor -> silica percentage)
r_channel = np.random.uniform(30, 255, 2000)
g_channel = np.random.uniform(30, 255, 2000)
b_channel = np.random.uniform(30, 255, 2000)

# Physics: silica reduces blue, increases red
silica_target = (
    (r_channel / (r_channel + g_channel + b_channel + 1)) * 100 +
    np.random.normal(0, 3, 2000)
)
silica_target = np.clip(silica_target, 0, 100)

X_silica = np.column_stack((r_channel, g_channel, b_channel)).astype(np.float32)
y_silica = silica_target.astype(np.float32).reshape(-1, 1)

# Normalize
scaler_silica = StandardScaler()
X_silica_scaled = scaler_silica.fit_transform(X_silica)

n_train = int(len(X_silica) * 0.8)
X_silica_train = X_silica_scaled[:n_train].astype(np.float32)
y_silica_train = y_silica[:n_train].astype(np.float32)
X_silica_test = X_silica_scaled[n_train:].astype(np.float32)
y_silica_test = y_silica[n_train:].astype(np.float32)

# Build silica model
silica_model = keras.Sequential([
    layers.Input(shape=(3,)),
    layers.Dense(16, activation='relu'),
    layers.BatchNormalization(),
    layers.Dropout(0.15),
    layers.Dense(8, activation='relu'),
    layers.Dense(1)  # Regression output (0-100%)
], name="silica_model")

silica_model.compile(optimizer=keras.optimizers.Adam(1e-3), loss='mse', metrics=['mae'])
silica_model.fit(
    X_silica_train, y_silica_train,
    validation_split=0.2,
    epochs=100,
    batch_size=32,
    verbose=0
)

silica_loss_test = silica_model.evaluate(X_silica_test, y_silica_test, verbose=0)
print(f"✅ Silica Model - Test MSE: {silica_loss_test[0]:.4f}, MAE: {silica_loss_test[1]:.4f}")

print(f"   Normalization params (copy to ESP32):")
print(f"   silica_mean = {list(scaler_silica.mean_)}")
print(f"   silica_std = {list(scaler_silica.scale_)}")

# ============================================================
# 3️⃣  DECISION MODEL (Binary Classification)
# ============================================================
print("\n[3/3] Training DECISION MODEL...")

# Synthetic data (temp, humidity, silica -> production decision)
temp_dec = np.random.uniform(15, 50, 2000)
humidity_dec = np.random.uniform(20, 95, 2000)
silica_dec = np.random.uniform(0, 100, 2000)

# Decision logic: produce if conditions optimal
decision_target = (
    (humidity_dec > 60) &
    (temp_dec < 40) &
    (temp_dec > 20) &
    (silica_dec > 70)
).astype(np.float32)

X_decision = np.column_stack((temp_dec, humidity_dec, silica_dec)).astype(np.float32)
y_decision = decision_target.reshape(-1, 1)

# Normalize
scaler_decision = StandardScaler()
X_decision_scaled = scaler_decision.fit_transform(X_decision)

n_train = int(len(X_decision) * 0.8)
X_decision_train = X_decision_scaled[:n_train].astype(np.float32)
y_decision_train = y_decision[:n_train].astype(np.float32)
X_decision_test = X_decision_scaled[n_train:].astype(np.float32)
y_decision_test = y_decision[n_train:].astype(np.float32)

# Build decision model
decision_model = keras.Sequential([
    layers.Input(shape=(3,)),
    layers.Dense(16, activation='relu'),
    layers.BatchNormalization(),
    layers.Dropout(0.15),
    layers.Dense(8, activation='relu'),
    layers.Dense(1, activation='sigmoid')  # Binary output
], name="decision_model")

decision_model.compile(
    optimizer=keras.optimizers.Adam(1e-3),
    loss='binary_crossentropy',
    metrics=['accuracy']
)
decision_model.fit(
    X_decision_train, y_decision_train,
    validation_split=0.2,
    epochs=100,
    batch_size=32,
    verbose=0
)

decision_loss_test, decision_acc_test = decision_model.evaluate(X_decision_test, y_decision_test, verbose=0)
print(f"✅ Decision Model - Test Loss: {decision_loss_test:.4f}, Accuracy: {decision_acc_test*100:.2f}%")

print(f"   Normalization params (copy to ESP32):")
print(f"   decision_mean = {list(scaler_decision.mean_)}")
print(f"   decision_std = {list(scaler_decision.scale_)}")

# ============================================================
# 4️⃣  CONVERT TO TFLITE
# ============================================================
print("\n" + "="*60)
print("🔄 Converting to TFLite...")

def convert_to_tflite(model, name_stem):
    """Convert Keras model to quantized TFLite"""
    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    converter.target_spec.supported_ops = [
        tf.lite.OpsSet.TFLITE_BUILTINS_INT8
    ]
    converter.inference_input_type = tf.float32
    converter.inference_output_type = tf.float32
    
    tflite_model = converter.convert()
    
    # Save .tflite file
    tflite_path = f"Back/ml/{name_stem}.tflite"
    os.makedirs("Back/ml", exist_ok=True)
    with open(tflite_path, 'wb') as f:
        f.write(tflite_model)
    
    print(f"✅ {tflite_path} ({len(tflite_model):,} bytes)")
    return tflite_model

tflite_flow = convert_to_tflite(flow_model, "flow_model")
tflite_silica = convert_to_tflite(silica_model, "silica_model")
tflite_decision = convert_to_tflite(decision_model, "decision_model")

# ============================================================
# 5️⃣  GENERATE C HEADER FILES
# ============================================================
print("\n🔧 Generating C header files...")

def tflite_to_c_array(tflite_bytes, var_name, header_file):
    """Convert TFLite model to C byte array"""
    hex_vals = [f"0x{b:02x}" for b in tflite_bytes]
    
    with open(header_file, 'w') as f:
        f.write("// Auto-generated TFLite model\n")
        f.write("// DO NOT EDIT - regenerate from train script\n")
        f.write("#pragma once\n\n")
        f.write(f"const unsigned char {var_name}[] = {{\n")
        
        for i in range(0, len(hex_vals), 12):
            chunk = hex_vals[i:i+12]
            f.write("  " + ", ".join(chunk) + ",\n")
        
        f.write("};\n\n")
        f.write(f"const unsigned int {var_name}_len = {len(tflite_bytes)};\n")
    
    print(f"✅ {header_file}")

os.makedirs("Back/ml", exist_ok=True)
tflite_to_c_array(tflite_flow, "flow_model_tflite", "Back/ml/flow_model.h")
tflite_to_c_array(tflite_silica, "silica_model_tflite", "Back/ml/silica_model.h")
tflite_to_c_array(tflite_decision, "decision_model_tflite", "Back/ml/decision_model.h")

# ============================================================
# 6️⃣  GENERATE ESP32 CONFIGURATION
# ============================================================
print("\n📋 Generating ESP32 configuration header...")

config_header = """// ESP32 Multi-Model Configuration
// Generated from train_multi_model.py
#pragma once

// ========== FLOW MODEL ==========
const float FLOW_MEAN[] = {""" + ", ".join([f"{x:.6f}f" for x in scaler_flow.mean_]) + """};
const float FLOW_STD[] = {""" + ", ".join([f"{x:.6f}f" for x in scaler_flow.scale_]) + """};
const int FLOW_INPUT_SIZE = 3;  // temp, humidity, water_level

// ========== SILICA MODEL ==========
const float SILICA_MEAN[] = {""" + ", ".join([f"{x:.6f}f" for x in scaler_silica.mean_]) + """};
const float SILICA_STD[] = {""" + ", ".join([f"{x:.6f}f" for x in scaler_silica.scale_]) + """};
const int SILICA_INPUT_SIZE = 3;  // R, G, B channels

// ========== DECISION MODEL ==========
const float DECISION_MEAN[] = {""" + ", ".join([f"{x:.6f}f" for x in scaler_decision.mean_]) + """};
const float DECISION_STD[] = {""" + ", ".join([f"{x:.6f}f" for x in scaler_decision.scale_]) + """};
const int DECISION_INPUT_SIZE = 3;  // temp, humidity, silica

// Memory allocation
const int ARENA_SIZE = 30 * 1024;  // 30KB for all 3 models
"""

with open("Back/ml/model_config.h", 'w') as f:
    f.write(config_header)

print("✅ Back/ml/model_config.h")

# ============================================================
# 7️⃣  SUMMARY
# ============================================================
print("\n" + "="*60)
print("✨ TRAINING COMPLETE")
print("="*60)
print("\n📦 Generated Files:")
print("  ✅ Back/ml/flow_model.tflite")
print("  ✅ Back/ml/silica_model.tflite")
print("  ✅ Back/ml/decision_model.tflite")
print("\n📄 Header Files (for ESP32):")
print("  ✅ Back/ml/flow_model.h")
print("  ✅ Back/ml/silica_model.h")
print("  ✅ Back/ml/decision_model.h")
print("  ✅ Back/ml/model_config.h")

print("\n📊 Model Performance:")
print(f"  Flow:     MSE={flow_loss_test[0]:.4f}")
print(f"  Silica:   MSE={silica_loss_test[0]:.4f}")
print(f"  Decision: Accuracy={decision_acc_test*100:.2f}%")

print("\n🔥 NEXT STEPS:")
print("  1. Copy Back/ml/*.h files to your ESP32 project")
print("  2. Update ESP32 firmware (see esp32_military_firmware.ino)")
print("  3. Compile and upload to ESP32")
print("\n✨ Ready for production!")
