// lib_deps: adafruit/Adafruit NeoPixel
// Lights pixels 0 (red), 1 (green) and 15 (blue) of a 16-pixel ring on pin 6.
#include <Adafruit_NeoPixel.h>
Adafruit_NeoPixel ring(16, 6, NEO_GRB + NEO_KHZ800);
void setup() {
  ring.begin();
  ring.setPixelColor(0, ring.Color(255, 0, 0));
  ring.setPixelColor(1, ring.Color(0, 255, 0));
  ring.setPixelColor(15, ring.Color(0, 0, 255));
  ring.show();
  Serial.begin(115200);
  Serial.println("shown");
}
void loop() {}
