// lib_deps: marcoschwartz/LiquidCrystal_I2C@^1.1.4
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
void setup() { lcd.init(); lcd.backlight(); lcd.print("I2C works"); lcd.setCursor(2, 1); lcd.print("0x27"); }
void loop() {}
