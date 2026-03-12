import subprocess
import re
from models import BSSIDReading


def scan_networks() -> list[BSSIDReading]:
    """Run netsh to scan visible WiFi networks and parse results."""
    result = subprocess.run(
        ["netsh", "wlan", "show", "networks", "mode=bssid"],
        capture_output=True,
        text=True,
        timeout=10,
    )

    if result.returncode != 0:
        return []

    return _parse_netsh_output(result.stdout)


def _parse_netsh_output(output: str) -> list[BSSIDReading]:
    readings = []
    current_ssid = ""
    current_bssid = ""
    current_signal = 0
    current_channel = 0
    current_band = ""

    for line in output.splitlines():
        line = line.strip()

        # Match SSID (but not BSSID)
        ssid_match = re.match(r"^SSID \d+ : (.*)$", line)
        if ssid_match:
            current_ssid = ssid_match.group(1).strip()
            continue

        # Match BSSID
        bssid_match = re.match(r"^BSSID \d+\s*: (.*)$", line)
        if bssid_match:
            # Save previous reading if we have one
            if current_bssid:
                readings.append(BSSIDReading(
                    ssid=current_ssid,
                    bssid=current_bssid,
                    signal_pct=current_signal,
                    band=current_band,
                    channel=current_channel,
                ))
            current_bssid = bssid_match.group(1).strip()
            current_signal = 0
            current_channel = 0
            current_band = ""
            continue

        if line.startswith("Signal"):
            match = re.search(r"(\d+)%", line)
            if match:
                current_signal = int(match.group(1))
        elif line.startswith("Channel"):
            match = re.search(r":\s*(\d+)", line)
            if match:
                current_channel = int(match.group(1))
        elif line.startswith("Radio type") or line.startswith("Band"):
            match = re.search(r":\s*(.+)", line)
            if match:
                current_band = match.group(1).strip()

    # Don't forget the last entry
    if current_bssid:
        readings.append(BSSIDReading(
            ssid=current_ssid,
            bssid=current_bssid,
            signal_pct=current_signal,
            band=current_band,
            channel=current_channel,
        ))

    return readings
