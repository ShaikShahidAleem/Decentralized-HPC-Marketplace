import time
import json
import random
import sys

def emit(stage, step, epoch=None, loss=None, accuracy=None, f1=None, message=""):
    data = {"stage": stage, "step": step, "message": message}
    if epoch is not None: data["epoch"] = epoch
    if loss is not None: data["loss"] = loss
    if accuracy is not None: data["accuracy"] = accuracy
    if f1 is not None: data["f1"] = f1
    print(json.dumps(data))
    sys.stdout.flush()

emit("preprocessing", "start", message="Cleaning data...")
time.sleep(1)
emit("preprocessing", "middle", message="Handling missing values...")
time.sleep(1)
emit("preprocessing", "end", message="Dataset ready")
time.sleep(1)

loss = 1.5
for i in range(1, 6):
    loss = loss * 0.8
    emit("training", "epoch", epoch=i, loss=loss, message=f"Epoch {i} completed")
    time.sleep(1)

emit("evaluation", "start", message="Running test set evaluation...")
time.sleep(1)
emit("evaluation", "end", accuracy=0.92, f1=0.89, message="Evaluation complete")
time.sleep(1)