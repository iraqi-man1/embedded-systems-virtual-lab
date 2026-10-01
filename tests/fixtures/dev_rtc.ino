// lib_deps: adafruit/RTClib
// Sets the DS1307 to a fixed time, then prints the time every second.
#include <RTClib.h>
RTC_DS1307 rtc;
void setup() {
  Serial.begin(115200);
  if (!rtc.begin()) { Serial.println("no rtc"); for (;;) {} }
  rtc.adjust(DateTime(2025, 12, 31, 23, 59, 58));
  rtc.writenvram(0, 42);
  Serial.print("ram="); Serial.println(rtc.readnvram(0));
}
void loop() {
  DateTime now = rtc.now();
  char buf[] = "YYYY-MM-DD hh:mm:ss";
  Serial.println(now.toString(buf));
  delay(1000);
}
