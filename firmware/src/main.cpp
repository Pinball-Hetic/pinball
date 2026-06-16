// Firmware boutons borne Pinball — ESP32, protocole série BTN:ID:DOWN/UP.
//
// Boutons actifs-bas (INPUT_PULLUP, bouton↔GND → pressé = LOW). Anti-rebond
// logiciel 8 ms : un changement n'est validé qu'après 8 ms de lecture stable.
// Émission UNIQUEMENT sur front validé (pas d'état au boot). ZÉRO WiFi, ZÉRO
// JSON, ZÉRO heartbeat, ZÉRO LED.
//
// Le mapping id→action (FLIP_LEFT, etc.) vit côté TS (CABINET_BUTTONS, paquet
// @pinball/shared-types). Ce firmware n'émet QUE l'identifiant physique.

#include <Arduino.h>

struct Button {
  const char* id;   // identifiant physique UPPER_SNAKE (= CABINET_BUTTONS.id)
  uint8_t gpio;     // pin ESP32
  bool stable;      // dernier état stable (HIGH = relâché, LOW = pressé)
  bool reading;     // dernière lecture brute (pour mesurer la stabilité)
  uint32_t tLast;   // millis() du dernier changement de lecture brute
};

// Doit rester strictement aligné sur CABINET_BUTTONS (shared-types).
static Button buttons[] = {
  { "BLACK_LEFT",        16, HIGH, HIGH, 0 },
  { "WHITE_LEFT",         4, HIGH, HIGH, 0 },
  { "FRONT_LEFT_GREEN",  17, HIGH, HIGH, 0 },
  { "FRONT_LEFT_YELLOW", 18, HIGH, HIGH, 0 },
  { "FRONT_LEFT_RED",    19, HIGH, HIGH, 0 },
  { "BLACK_RIGHT",       13, HIGH, HIGH, 0 },
  { "WHITE_RIGHT",       25, HIGH, HIGH, 0 },
  { "FRONT_WHITE",       33, HIGH, HIGH, 0 },
  { "PLUNGER",           32, HIGH, HIGH, 0 },
};

static const size_t BUTTON_COUNT = sizeof(buttons) / sizeof(buttons[0]);
static const uint32_t DEBOUNCE_MS = 8;

void setup() {
  Serial.begin(115200);
  for (size_t i = 0; i < BUTTON_COUNT; i++) {
    pinMode(buttons[i].gpio, INPUT_PULLUP);
  }
}

void loop() {
  const uint32_t now = millis();
  for (size_t i = 0; i < BUTTON_COUNT; i++) {
    Button& b = buttons[i];
    const bool raw = digitalRead(b.gpio);

    // Lecture brute changée → redémarre la fenêtre de stabilité.
    if (raw != b.reading) {
      b.reading = raw;
      b.tLast = now;
      continue;
    }

    // Lecture stable depuis DEBOUNCE_MS et différente de l'état validé → front.
    if (raw != b.stable && (now - b.tLast) >= DEBOUNCE_MS) {
      b.stable = raw;
      const bool pressed = (raw == LOW); // actif bas
      Serial.printf("BTN:%s:%s\n", b.id, pressed ? "DOWN" : "UP");
    }
  }
}
