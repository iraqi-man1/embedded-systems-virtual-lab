// lib_deps: arduino-libraries/LiquidCrystal@^1.0.7
#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
void setup() { lcd.begin(16, 2); lcd.print("Hello, Lab!"); lcd.setCursor(0, 1); lcd.print("Line 2 ok"); }
void loop() {}
