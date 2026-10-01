// lib_deps: adafruit/Adafruit SSD1306, adafruit/Adafruit GFX Library
// Draws a filled box in the top-left corner and text with Adafruit_SSD1306.
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
void setup() {
  Serial.begin(115200);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { Serial.println("oled failed"); for (;;) {} }
  display.clearDisplay();
  display.fillRect(0, 0, 10, 10, SSD1306_WHITE);
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(20, 30);
  display.print("Hi");
  display.drawPixel(127, 63, SSD1306_WHITE);
  display.display();
  Serial.println("drawn");
}
void loop() {}
