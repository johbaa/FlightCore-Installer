#!/bin/bash
set -u

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
OUTDIR="$HOME/Desktop/DJI_Spark_Recovery"
mkdir -p "$OUTDIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
LOG="$OUTDIR/DJI_Spark_SMBus_Recovery_${STAMP}.txt"
exec > >(tee "$LOG") 2>&1

echo "============================================================"
echo "DJI Spark + Arduino Nano Matter SMBus Recovery V7"
echo "Started: $(date)"
echo "The diagnostic phase is read-only. PF reset is separately confirmed."
echo "============================================================"

fail() { echo "FAIL: $*"; echo "Log: $LOG"; exit 1; }
command -v arduino-cli >/dev/null 2>&1 || fail "arduino-cli is not installed. Install it with: brew install arduino-cli"
arduino-cli core list | grep -q '^SiliconLabs:silabs' || fail "Nano Matter core missing. Run: arduino-cli core install SiliconLabs:silabs"
PYTHON=""
for CANDIDATE in "$HOME/dji-test-venv/bin/python3" python3; do
  if { [ -x "$CANDIDATE" ] || command -v "$CANDIDATE" >/dev/null 2>&1; } && \
     "$CANDIDATE" -c 'import serial' >/dev/null 2>&1; then
    PYTHON="$CANDIDATE"
    break
  fi
done
[ -n "$PYTHON" ] || fail "Python pyserial is required. Run: python3 -m pip install --user pyserial"

PORT="$(compgen -G '/dev/cu.usbmodem*' | sort | head -n 1 || true)"
[ -n "$PORT" ] || fail "Connect the Nano Matter by USB-C."

WORK="$(mktemp -d "${TMPDIR:-/tmp}/spark-nanomatter-smbus-v1.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
SKETCH="$WORK/SparkSMBusBridgeV1"
mkdir -p "$SKETCH"

cat > "$SKETCH/SparkSMBusBridgeV1.ino" <<'INO'
#include <Arduino.h>
#include <Wire.h>

#ifndef ARDUINO_NANO_MATTER
#error "This sketch is only for Arduino Nano Matter"
#endif

constexpr uint8_t BATTERY_ADDRESS = 0x0B;
char lineBuffer[180];
size_t lineLength = 0;

void printHex(uint8_t value) {
  const char *digits = "0123456789ABCDEF";
  Serial.print(digits[value >> 4]);
  Serial.print(digits[value & 15]);
}

int hexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

bool writeBytes(const uint8_t *data, size_t length) {
  Wire.beginTransmission(BATTERY_ADDRESS);
  for (size_t i = 0; i < length; ++i) Wire.write(data[i]);
  return Wire.endTransmission() == 0;
}

void readRaw(uint8_t reg, uint8_t wanted) {
  Wire.beginTransmission(BATTERY_ADDRESS);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) { Serial.println("ERR I2C_WRITE"); return; }
  delay(3);
  uint8_t received = Wire.requestFrom((int)BATTERY_ADDRESS, (int)wanted);
  Serial.print("OK ");
  Serial.print(received);
  for (uint8_t i = 0; i < received && Wire.available(); ++i) {
    Serial.print(' '); printHex((uint8_t)Wire.read());
  }
  Serial.println();
}

void processLine(char *line) {
  if (!strcmp(line, "PING")) { Serial.println("OK PONG"); return; }

  unsigned reg = 0, value = 0, wanted = 0;
  if (sscanf(line, "RW %x", &reg) == 1) { readRaw((uint8_t)reg, 2); return; }
  if (sscanf(line, "RB %x %u", &reg, &wanted) == 2) {
    if (wanted < 1 || wanted > 32) { Serial.println("ERR LENGTH"); return; }
    readRaw((uint8_t)reg, (uint8_t)wanted); return;
  }
  if (sscanf(line, "WW %x %x", &reg, &value) == 2) {
    uint8_t packet[3] = {(uint8_t)reg, (uint8_t)value, (uint8_t)(value >> 8)};
    Serial.println(writeBytes(packet, sizeof(packet)) ? "OK WRITE" : "ERR I2C_WRITE");
    return;
  }
  if (!strncmp(line, "WB ", 3)) {
    char *p = line + 3;
    reg = strtoul(p, &p, 16);
    while (*p == ' ') ++p;
    size_t hexLength = strlen(p);
    if (!hexLength || (hexLength & 1) || hexLength > 60) { Serial.println("ERR HEX"); return; }
    uint8_t packet[32];
    size_t byteCount = hexLength / 2;
    packet[0] = (uint8_t)reg;
    packet[1] = (uint8_t)byteCount;
    for (size_t i = 0; i < byteCount; ++i) {
      int hi = hexNibble(p[2 * i]), lo = hexNibble(p[2 * i + 1]);
      if (hi < 0 || lo < 0) { Serial.println("ERR HEX"); return; }
      packet[i + 2] = (uint8_t)((hi << 4) | lo);
    }
    Serial.println(writeBytes(packet, byteCount + 2) ? "OK WRITE" : "ERR I2C_WRITE");
    return;
  }
  Serial.println("ERR COMMAND");
}

void setup() {
  Serial.begin(115200);
  Wire.begin();                  // Nano Matter SDA=A4, SCL=A5
  Wire.setClock(100000);
  delay(500);
  Serial.println("READY SparkSMBusBridgeV7");
}

void loop() {
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      lineBuffer[lineLength] = 0;
      if (lineLength) processLine(lineBuffer);
      lineLength = 0;
    } else if (lineLength + 1 < sizeof(lineBuffer)) {
      lineBuffer[lineLength++] = c;
    }
  }
}
INO

FQBN="SiliconLabs:silabs:nano_matter:protocol_stack=none"
echo "Compiling Nano Matter SMBus bridge..."
arduino-cli compile --fqbn "$FQBN" "$SKETCH" || fail "Compile failed."
echo "Uploading to $PORT..."
arduino-cli upload -p "$PORT" --fqbn "$FQBN" "$SKETCH" || fail "Upload failed."
sleep 3
NEWPORT="$(compgen -G '/dev/cu.usbmodem*' | sort | head -n 1 || true)"
[ -n "$NEWPORT" ] || fail "Nano Matter serial port did not return after upload."

"$PYTHON" - "$NEWPORT" <<'PY'
import hashlib, os, sys, time
import serial

port = sys.argv[1]
connection = serial.Serial(port, 115200, timeout=0.20, write_timeout=2.0)
terminal = open("/dev/tty", "r", buffering=1)
time.sleep(2.5)  # Native-USB Nano Matter may reset when DTR is asserted.
connection.reset_input_buffer()

def line(timeout=3.0):
    end = time.time() + timeout
    data = bytearray()
    while time.time() < end:
        chunk = connection.read(256)
        if not chunk: continue
        for b in chunk:
            if b == 10:
                if data: return data.decode('ascii', 'replace').strip()
            elif b != 13: data.append(b)
    raise RuntimeError("serial response timeout")

def command(text, timeout=3.0):
    connection.write((text + "\n").encode())
    connection.flush()
    answer = line(timeout)
    if not answer.startswith("OK "):
        raise RuntimeError(f"{text}: {answer}")
    return answer

def raw(command_text, wanted):
    fields = command(command_text).split()
    count = int(fields[1])
    data = bytes(int(x, 16) for x in fields[2:])
    if count != len(data) or len(data) < wanted:
        raise RuntimeError(f"short SMBus reply to {command_text}: {data.hex()}")
    return data

def word(reg):
    data = raw(f"RW {reg:02X}", 2)
    return data[0] | data[1] << 8

def block(reg, max_bytes=32):
    data = raw(f"RB {reg:02X} {max_bytes}", 1)
    n = data[0]
    if n > 31 or len(data) < n + 1:
        raise RuntimeError(f"invalid SMBus block at 0x{reg:02X}: {data.hex()}")
    return data[1:n+1]

def text_block(reg):
    return block(reg).decode('ascii', 'replace').strip('\x00 ')

def status_u32(subcmd, direct_reg, name):
    """Read a 32-bit BQ status in sealed or unsealed state.

    Sealed gauges expose these through ManufacturerAccess (0x00) followed by
    ManufacturerData (0x23).  Unsealed gauges also expose direct block
    commands at 0x51..0x54, which are retained as a guarded fallback.
    """
    errors = []
    for attempt in range(3):
        try:
            command(f"WW 00 {subcmd:04X}")
            time.sleep(0.20)
            data = block(0x23)
            if len(data) >= 6 and int.from_bytes(data[:2], "little") == subcmd:
                data = data[2:]
            if len(data) != 4:
                raise RuntimeError(f"{name} returned {len(data)} bytes via ManufacturerData")
            return int.from_bytes(data, "little")
        except Exception as exc:
            errors.append(f"MAC attempt {attempt + 1}: {exc}")
            time.sleep(0.25)
    try:
        data = block(direct_reg)
        if len(data) != 4:
            raise RuntimeError(f"{name} returned {len(data)} bytes directly")
        return int.from_bytes(data, "little")
    except Exception as exc:
        errors.append(f"direct: {exc}")
    raise RuntimeError(f"cannot read {name}: " + "; ".join(errors))

def security_name(operation_status):
    mode = (operation_status >> 8) & 0x3
    return {0: "Reserved", 1: "Full Access", 2: "Unsealed", 3: "Sealed"}[mode]

def print_status_set(prefix, operation, safety, pf_alert, pf_status):
    print(prefix)
    print(f"  Security     : {security_name(operation)}")
    print(f"  Operation    : 0x{operation:08X}")
    print(f"  SafetyStatus : 0x{safety:08X}  (CUV={'ACTIVE' if safety & 1 else 'clear'})")
    print(f"  PFAlert      : 0x{pf_alert:08X}  (SUV={'ACTIVE' if pf_alert & 1 else 'clear'})")
    print(f"  PFStatus     : 0x{pf_status:08X}  (SUV={'LATCHED' if pf_status & 1 else 'clear'})")

unsealed = False
try:
    last_error = None
    for attempt in range(10):
        try:
            connection.reset_input_buffer()
            command("PING", 2.0)
            last_error = None
            break
        except Exception as exc:
            last_error = exc
            time.sleep(1.0)
    if last_error is not None:
        raise RuntimeError(f"Nano serial handshake failed after retries: {last_error}")
    print("\nRead-only battery report")
    manufacturer = text_block(0x20)
    device = text_block(0x21)
    chemistry = text_block(0x22)
    pack_mv = word(0x09)
    charge_pct = word(0x0D)
    cycles = word(0x17)
    cells = [word(0x3F), word(0x3E), word(0x3D)]
    print(f"  Manufacturer : {manufacturer}")
    print(f"  Device       : {device}")
    print(f"  Chemistry    : {chemistry}")
    print(f"  Pack voltage : {pack_mv/1000:.3f} V")
    print(f"  Cells        : {cells[0]/1000:.3f}, {cells[1]/1000:.3f}, {cells[2]/1000:.3f} V")
    print(f"  Cell spread  : {max(cells)-min(cells)} mV")
    print(f"  Charge       : {charge_pct}%")
    print(f"  Cycles       : {cycles}")

    cell_spread = max(cells) - min(cells)
    reasons = []
    if "DJI" not in (manufacturer + " " + device).upper(): reasons.append("gauge does not identify as DJI")
    if pack_mv < 5400: reasons.append("pack voltage is below the absolute 5.400 V recovery floor")
    if pack_mv > 13200: reasons.append("pack voltage is implausibly high")
    if min(cells) < 1800: reasons.append("at least one cell is below the absolute 1.800 V recovery floor")
    if max(cells) > 4400: reasons.append("at least one reported cell voltage is implausibly high")
    if cell_spread > 300: reasons.append("cell spread exceeds the absolute 300 mV override limit")
    if abs(sum(cells) - pack_mv) > 700: reasons.append("cell sum does not agree with pack voltage")
    if reasons:
        print("\nFAIL: PF clearing is locked out:")
        for reason in reasons: print("  - " + reason)
        print("Do not charge or fly this pack. Diagnose the cells/BMS first.")
        raise SystemExit(20)

    if min(cells) < 2500:
        print("\nWARNING: at least one cell is below 2.500 V and severely over-discharged.")
        print("Recovery is permitted down to 1.800 V/cell, but this does not establish that the cell is safe or serviceable.")
        print("The BMS must report live CUV clear before PF reset can be sent.")

    if cell_spread > 200:
        print("\nWARNING: cell spread exceeds the normal 200 mV safety limit.")
        print("Operator override permits PF clearing up to 300 mV so the genuine DJI charger can balance the pack.")
        print("The first DJI charge must be continuously supervised; stop for heat, swelling, smell, or a charging fault.")

    operation_before = status_u32(0x54, 0x54, "OperationStatus")
    safety_before = status_u32(0x51, 0x51, "SafetyStatus")
    pf_alert_before = status_u32(0x52, 0x52, "PFAlert")
    pf_before = status_u32(0x53, 0x53, "PFStatus")
    print_status_set("\nVerified read-only BMS status", operation_before,
                     safety_before, pf_alert_before, pf_before)

    print("\nPASS: SMBus communications and guarded voltage checks passed.")
    print("This does NOT prove that this old battery is safe or healthy.")
    if safety_before & 1:
        print("\nBLOCKED: live Cell Undervoltage (CUV) is still active.")
        print("Keep the 9 V wake supply connected and allow the cell readings to rise, then run recovery again.")
        print("PF reset cannot remain cleared while the BMS still reports an active undervoltage fault.")
        print("PF clearing was not offered and no settings were changed.")
        raise SystemExit(22)
    if pf_before == 0:
        print("\nPASS: PFStatus is already zero; no PF reset is needed.")
        raise SystemExit(0)
    if os.environ.get("DJI_SPARK_WEB_CONFIRMED") == "1":
        print("\nRecovery authorized by the local web control.")
        answer = "CLEAR-PF"
    else:
        print("\nType CLEAR-PF to authenticate, clear PF data, and reseal; anything else quits: ", end="", flush=True)
        answer = terminal.readline().strip()
    if answer != "CLEAR-PF":
        print("No settings were changed.")
        raise SystemExit(0)

    if device.strip().upper() == "DJI016":
        print("Security protocol: DJI016/BQ9003 custom two-word keys")
        # DJI 32-bit UNSEAL key 0xCCDF7EE0, least-significant word first.
        command("WW 00 7EE0")
        command("WW 00 CCDF")
        # Authentication may now have succeeded even if a verification read
        # loses contact, so all later exceptions must attempt a safety reseal.
        unsealed = True
        time.sleep(0.35)
        operation_unseal_stage = status_u32(0x54, 0x54, "OperationStatus after unseal key")
        unseal_stage = (operation_unseal_stage >> 8) & 0x3
        print(f"Unseal verification  : {security_name(operation_unseal_stage)}")
        if unseal_stage not in (1, 2):
            raise RuntimeError("DJI custom unseal key was rejected; gauge is still sealed")

        if unseal_stage == 2:
            # DJI 32-bit FULL ACCESS key 0xE0BCBF17, LSW first.  Full access
            # removes any ambiguity about whether PF reset is authorized.
            command("WW 00 BF17")
            command("WW 00 E0BC")
            time.sleep(0.35)
    else:
        # Compatibility path for BQ30-family batteries.
        command("WW 00 0031")
        time.sleep(0.6)
        auth_raw = raw("RB 2F 32", 2)
        if auth_raw[0] == 20 and len(auth_raw) >= 21:
            print("Security protocol: BQ30 SHA-1 challenge/response")
            challenge_wire = auth_raw[1:21]
            key = bytes.fromhex("0123456789abcdeffedcba9876543210")
            challenge = challenge_wire[::-1]
            h1 = hashlib.sha1(key + challenge).digest()
            response_wire = hashlib.sha1(key + h1).digest()[::-1]
            command("WB 2F " + response_wire.hex())
            unsealed = True
            time.sleep(0.8)
        else:
            raise RuntimeError("unrecognized authentication response: " + auth_raw.hex())

    operation_unsealed = status_u32(0x54, 0x54, "OperationStatus after authentication")
    security_after_auth = (operation_unsealed >> 8) & 0x3
    print(f"Security verification: {security_name(operation_unsealed)}")
    if device.strip().upper() == "DJI016" and security_after_auth != 1:
        raise RuntimeError("DJI full-access key was rejected")
    if device.strip().upper() != "DJI016" and security_after_auth not in (1, 2):
        raise RuntimeError("authentication was rejected; gauge is still sealed")
    safety_unsealed = status_u32(0x51, 0x51, "SafetyStatus after authentication")
    pf_alert_unsealed = status_u32(0x52, 0x52, "PFAlert after authentication")
    pf_before = status_u32(0x53, 0x53, "PFStatus before reset")
    print_status_set("Verified status before PF reset", operation_unsealed,
                     safety_unsealed, pf_alert_unsealed, pf_before)
    if safety_unsealed & 1:
        raise RuntimeError("live Cell Undervoltage became active; PF reset was not sent")

    command("WW 00 0029")       # PermanentFailDataReset
    time.sleep(2.0)
    operation_after = status_u32(0x54, 0x54, "OperationStatus after reset")
    safety_after = status_u32(0x51, 0x51, "SafetyStatus after reset")
    pf_alert_after = status_u32(0x52, 0x52, "PFAlert after reset")
    pf_after = status_u32(0x53, 0x53, "PFStatus after reset")
    print_status_set("Verified status after PF reset", operation_after,
                     safety_after, pf_alert_after, pf_after)

    command("WW 00 0030")       # SealDevice
    time.sleep(0.8)
    operation_resealed = status_u32(0x54, 0x54, "OperationStatus after reseal")
    if ((operation_resealed >> 8) & 0x3) != 3:
        raise RuntimeError(f"reseal verification failed: {security_name(operation_resealed)}")
    unsealed = False
    print("Reseal verification : Sealed")
    if pf_after:
        if safety_after & 1:
            print("\nFAIL: PF was immediately re-latched because live CUV is active.")
        else:
            print("\nFAIL: PFStatus remains nonzero although live CUV is clear.")
            print("The DJI-specific reset sequence requires further correction; do not add more charge based on this result.")
        raise SystemExit(21)
    print("\nPASS: PFStatus cleared to zero and the gauge was resealed.")
    print("Now disconnect wiring, then try the genuine DJI charger under supervision.")
    print("If the fault immediately returns, the underlying cell/BMS fault remains.")
finally:
    if unsealed:
        try:
            command("WW 00 0030")
            print("Safety cleanup: reseal command sent.")
        except Exception as exc:
            print(f"WARNING: automatic reseal failed: {exc}")
    terminal.close()
    connection.close()
PY
STATUS=$?
echo ""
if [ "$STATUS" -eq 0 ]; then echo "Finished. Log: $LOG"; else echo "Stopped with status $STATUS. Log: $LOG"; fi
exit "$STATUS"
