import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import os, struct, warnings
warnings.filterwarnings('ignore')
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers, callbacks
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
print(f"TensorFlow  : {tf.__version__}")
print(f"Keras       : {keras.__version__}")
print("Dependencies loaded ✅")
CSV_PATH = "realml_realworld_v2.csv"   
df = pd.read_csv(CSV_PATH)
print(f"\nRaw shape   : {df.shape}")
print(f"Columns     : {list(df.columns)}")
df['timestamp'] = pd.to_datetime(df['timestamp'], format='ISO8601')
df = df.sort_values('timestamp').reset_index(drop=True)
df = df[df['confidence_human'] >= 0.70].reset_index(drop=True)
print(f"After filter: {df.shape}  (confidence ≥ 0.70)")
print(f"\nMode distribution:\n{df['target_mode'].value_counts().sort_index()}")
WINDOW = 3   
for col in ['temp', 'humidity', 'flow']:
    df[f'{col}_avg{WINDOW}'] = df[col].rolling(WINDOW, min_periods=1).mean()
    df[f'{col}_delta']       = df[col].diff().fillna(0).clip(-20, 20)
df['efficiency'] = (df['flow'] / (df['humidity'].clip(1, 100) / 100)).clip(0, 100)
print("\nEngineered columns added:")
new_cols = [c for c in df.columns if 'avg' in c or 'delta' in c or c == 'efficiency']
print(new_cols)
FEATURE_COLS = [
    'temp',
    'humidity',
    'battery',
    'tds',
    'water_level',
    'mcu_temp',
    'flow',
    'rgb_state',  
    'temp_delta',        
    'humidity_delta',    
    'flow_delta',        
    'temp_avg3',         
    'humidity_avg3',     
    'flow_avg3',         
    'efficiency',        
]
LABEL_COL  = 'target_mode'
NUM_CLASSES = 5   
X = df[FEATURE_COLS].values.astype(np.float32)
y = df[LABEL_COL].values.astype(np.int32)
print(f"\nFeature matrix : {X.shape}")
print(f"Label vector   : {y.shape}")
print(f"Classes        : {np.unique(y)}")
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)
print("\n╔═══════════════════════════════════════════════════╗")
print("║  Copy these arrays into awg_esp32_final.cpp       ║")
print("╚═══════════════════════════════════════════════════╝")
print(f"\n// StandardScaler mean (15 values)")
mean_str = ", ".join([f"{v:.6f}f" for v in scaler.mean_])
print(f"float g_mean[15]  = {{{mean_str}}};")
print(f"\n// StandardScaler std  (15 values)")
scale_str = ", ".join([f"{v:.6f}f" for v in scaler.scale_])
print(f"float g_scale[15] = {{{scale_str}}};")
n = len(X_scaled)
n_train = int(n * 0.70)
n_val   = int(n * 0.85)
X_train, y_train = X_scaled[:n_train],  y[:n_train]
X_val,   y_val   = X_scaled[n_train:n_val], y[n_train:n_val]
X_test,  y_test  = X_scaled[n_val:],    y[n_val:]
print(f"\nTrain : {X_train.shape[0]} samples")
print(f"Val   : {X_val.shape[0]}   samples")
print(f"Test  : {X_test.shape[0]}  samples")
y_train_oh = keras.utils.to_categorical(y_train, NUM_CLASSES)
y_val_oh   = keras.utils.to_categorical(y_val,   NUM_CLASSES)
y_test_oh  = keras.utils.to_categorical(y_test,  NUM_CLASSES)
def build_model(n_features=15, n_classes=5):
    inp = keras.Input(shape=(n_features,), name="sensors")
    x = layers.Dense(32, activation='relu', name="dense_1")(inp)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.2)(x)
    x = layers.Dense(16, activation='relu', name="dense_2")(x)
    x = layers.Dropout(0.2)(x)
    out = layers.Dense(n_classes, activation='softmax', name="mode_probs")(x)
    return keras.Model(inp, out, name="AWG_TimeML")
model = build_model(len(FEATURE_COLS), NUM_CLASSES)
model.summary()
model.compile(
    optimizer=keras.optimizers.Adam(learning_rate=1e-3),
    loss='categorical_crossentropy',
    metrics=['accuracy']
)
early_stop = callbacks.EarlyStopping(
    monitor='val_accuracy', patience=15, restore_best_weights=True, verbose=1)
reduce_lr = callbacks.ReduceLROnPlateau(
    monitor='val_loss', factor=0.5, patience=7, min_lr=1e-5, verbose=1)
history = model.fit(
    X_train, y_train_oh,
    validation_data=(X_val, y_val_oh),
    epochs=150,
    batch_size=32,
    callbacks=[early_stop, reduce_lr],
    verbose=1
)
_, train_acc = model.evaluate(X_train, y_train_oh, verbose=0)
_, val_acc   = model.evaluate(X_val,   y_val_oh,   verbose=0)
_, test_acc  = model.evaluate(X_test,  y_test_oh,  verbose=0)
print(f"\n{'─'*40}")
print(f"  Train accuracy : {train_acc*100:.2f}%")
print(f"  Val   accuracy : {val_acc*100:.2f}%")
print(f"  Test  accuracy : {test_acc*100:.2f}%")
print(f"{'─'*40}")
y_pred_probs = model.predict(X_test)
y_pred = np.argmax(y_pred_probs, axis=1)
mode_names = ['IDLE', 'LOW', 'NORMAL', 'HIGH', 'REGEN']
print("\nClassification Report:")
from sklearn.metrics import classification_report
print(classification_report(y_test, y_pred, target_names=mode_names, labels=[0,1,2,3,4], zero_division=0))
fig, axes = plt.subplots(1, 3, figsize=(18, 5))
axes[0].plot(history.history['loss'],     label='Train Loss')
axes[0].plot(history.history['val_loss'], label='Val Loss')
axes[0].set_title('Training Loss'); axes[0].legend(); axes[0].grid(True)
axes[1].plot(history.history['accuracy'],     label='Train Acc')
axes[1].plot(history.history['val_accuracy'], label='Val Acc')
axes[1].set_title('Training Accuracy'); axes[1].legend(); axes[1].grid(True)
cm = confusion_matrix(y_test, y_pred)
sns.heatmap(cm, annot=True, fmt='d', xticklabels=mode_names,
            yticklabels=mode_names, cmap='Blues', ax=axes[2])
axes[2].set_title('Confusion Matrix (Test Set)')
axes[2].set_xlabel('Predicted'); axes[2].set_ylabel('Actual')
plt.tight_layout()
plt.savefig('training_results.png', dpi=150)
plt.show()
print("Plot saved → training_results.png ✅")
model.save("awg_model_full.keras")
def representative_dataset():
    for i in range(0, len(X_scaled), 10):
        sample = X_scaled[i:i+1].astype(np.float32)
        yield [sample]
converter = tf.lite.TFLiteConverter.from_keras_model(model)
converter.optimizations           = [tf.lite.Optimize.DEFAULT]
converter.representative_dataset  = representative_dataset
converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
converter.inference_input_type    = tf.float32   
converter.inference_output_type   = tf.float32
tflite_model = converter.convert()
TFLITE_PATH = "awg_model.tflite"
with open(TFLITE_PATH, 'wb') as f:
    f.write(tflite_model)
print(f"\nTFLite model  : {len(tflite_model):,} bytes → {TFLITE_PATH} ✅")
def tflite_to_c_array(tflite_bytes: bytes, var_name: str = "model_tflite") -> str:
    hex_vals = [f"0x{b:02x}" for b in tflite_bytes]
    lines    = []
    lines.append("// Auto-generated by AWG Training Pipeline")
    lines.append("// DO NOT EDIT — replace this file when retraining")
    lines.append("#pragma once")
    lines.append(f"const unsigned char {var_name}[] = {{")
    for i in range(0, len(hex_vals), 12):
        chunk = hex_vals[i:i+12]
        lines.append("  " + ", ".join(chunk) + ",")
    lines.append("};")
    lines.append(f"const unsigned int {var_name}_len = {len(tflite_bytes)};")
    return "\n".join(lines)
model_h_content = tflite_to_c_array(tflite_model)
with open("model.h", "w") as f:
    f.write(model_h_content)
print(f"model.h       : {len(model_h_content)} chars ✅")
try:
    from google.colab import files
    files.download("awg_model.tflite")
    files.download("model.h")
    print("🚀 Model downloads triggered!")
except Exception:
    print("Running outside Colab - check local folder for model files.")
print("\n╔══════════════════════════════════════════╗")
print("║  Copy model.h into your Arduino project  ║")
print("╚══════════════════════════════════════════╝")
interp = tf.lite.Interpreter(model_path=TFLITE_PATH)
interp.allocate_tensors()
in_idx  = interp.get_input_details()[0]['index']
out_idx = interp.get_output_details()[0]['index']
tflite_preds = []
for sample in X_test:
    interp.set_tensor(in_idx, sample.reshape(1, -1).astype(np.float32))
    interp.invoke()
    tflite_preds.append(np.argmax(interp.get_tensor(out_idx)))
tflite_acc = np.mean(np.array(tflite_preds) == y_test)
print(f"\nTFLite int8 test accuracy : {tflite_acc*100:.2f}%")
assert tflite_acc >= 0.82, "⚠️  Accuracy below 82% — collect more data!"
print("TFLite accuracy check passed ✅")
print("\n" + "═"*60)
print("PASTE THIS BLOCK INTO awg_esp32_final.cpp")
print("═"*60)
print(f"// NUM_FEATURES = {len(FEATURE_COLS)}")
for i, col in enumerate(FEATURE_COLS):
    print(f"// [{i:2d}] {col}")
print()
mean_arr  = ", ".join([f"{v:.6f}f" for v in scaler.mean_])
scale_arr = ", ".join([f"{v:.6f}f" for v in scaler.scale_])
print(f"float g_mean[{len(FEATURE_COLS)}]  = {{{mean_arr}}};")
print(f"float g_scale[{len(FEATURE_COLS)}] = {{{scale_arr}}};")
print("═"*60)
try:
    from google.colab import files
    files.download("model.h")
    files.download("awg_model.tflite")
    files.download("awg_model_full.keras")
    files.download("training_results.png")
    print("Downloads triggered ✅")
except ImportError:
    print("Not running in Colab — find files in current directory:")
    for f in ["model.h", "awg_model.tflite", "awg_model_full.keras", "training_results.png"]:
        if os.path.exists(f):
            print(f"  ✅ {f} ({os.path.getsize(f):,} bytes)")