"""
Gera o som de alerta do painel (sino de recepção em dois tons) em WAV.
Uso: python generate_alert_sound.py  ->  admin-web/public/sounds/new-order.wav
"""
import math
import struct
import wave
from pathlib import Path

RATE = 44100
OUT = Path(__file__).resolve().parent.parent / "admin-web" / "public" / "sounds" / "new-order.wav"


def bell(freq, duration, volume=0.55):
    samples = []
    for i in range(int(RATE * duration)):
        t = i / RATE
        env = math.exp(-4.0 * t) * min(1.0, t * 200)  # ataque rápido, decaimento de sino
        s = (math.sin(2 * math.pi * freq * t)
             + 0.45 * math.sin(2 * math.pi * freq * 2.01 * t)
             + 0.2 * math.sin(2 * math.pi * freq * 3.02 * t))
        samples.append(volume * env * s / 1.65)
    return samples


def silence(duration):
    return [0.0] * int(RATE * duration)


def main():
    data = bell(880, 0.55) + bell(1174.66, 0.9) + silence(0.15) + bell(880, 0.55) + bell(1174.66, 1.1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1, min(1, s)) * 32767)) for s in data))
    print(f"Som gerado em {OUT}")


if __name__ == "__main__":
    main()
