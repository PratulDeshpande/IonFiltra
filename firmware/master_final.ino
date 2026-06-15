#include <SPI.h>
#include <LoRa.h>
#include <ArduinoJson.h>

/* ---------- GSM CONFIGURATION ---------- */
#define RXD2 16
#define TXD2 17
#define GSM_BAUDRATE 115200

// Default Server URL
char serverURL[256] = "https://ionfiltra-api.onrender.com/api/ingest?token=ion_sensor_hw_token_2026_never_expires";

/* ---------- LORA MESH CONFIGURATION ---------- */
#define MESH_VERSION          0x01

#define PKT_REQ_ADDRESS       0x01
#define PKT_ACK_ADDRESS       0x02
#define PKT_REQ_DATA          0x03
#define PKT_SENSOR_DATA       0x04
#define PKT_ACK               0x05
#define PKT_MASTER_ADV        0x06

#define REQ_ACK_TIMEOUT_MS    1200
#define REQ_MAX_RETRIES       3
#define DUP_CACHE_SIZE        16 
#define MAX_NODES             100  
#define MASTER_ID  1
#define BROADCAST  0xFF

// Arrays to store UID and Node ID mappings
char uidArray[MAX_NODES][32];  
uint8_t nodeIdArray[MAX_NODES];
uint8_t nodeCount = 0; 

typedef struct {
  uint8_t src;
  uint16_t msg_id;
} SeenPacket;

SeenPacket seenPackets[DUP_CACHE_SIZE];
uint8_t seenIndex = 0;

#pragma pack(push, 1)
typedef struct {
  uint8_t  version;
  uint8_t  type;
  uint8_t  src;
  uint8_t  dest;
  uint8_t  ttl;
  uint8_t  flags;
  uint16_t msg_id;
  uint8_t payload_len;
} MeshHeader;
#pragma pack(pop)

/* ---------- NEW ENTERPRISE SENSOR PAYLOAD (BINARY STRUCT) ---------- */
// WARNING: Slave nodes MUST be updated to send this struct via LoRa
#pragma pack(push, 1)
typedef struct {
  uint8_t timer_slave_id;
  uint8_t relay_no;
  uint8_t ch_status;
  uint8_t svf_rly_stat;
  uint8_t sys_ok;
  uint8_t system_on;
  uint8_t plc_interlock;
  uint8_t dp_interlock;
  uint8_t ip3_interlock;
  uint8_t plc_interlock_stat;
  uint8_t dp_interlock_stat;
  uint8_t ip3_interlock_stat;
  uint8_t parallel_purge_mode;
  uint16_t ch_open_1_16;
  uint16_t ch_open_17_32;
  uint16_t ch_open_33_48;
  uint16_t ch_short_1_16;
  uint16_t baud_rate;
  uint16_t reserved;
  uint8_t on_time_unit;
  uint16_t on_time_lower_limit;
  uint16_t on_time_higher_limit;
  uint8_t off_time_unit;
  uint16_t off_time_lower_limit;
  uint16_t off_time_higher_limit;
  uint8_t pause_time_unit;
  uint16_t pause_time_lower_limit;
  uint16_t pause_time_higher_limit;
  float differential_pressure;
  float temp_in;
  float temp_out;
  float pressure_header;
  float particulate_matter;
  uint16_t cleaning_status;
} SensorPayload;
#pragma pack(pop)

/* ---------- BUFFERING SYSTEM (PHASE 3) ---------- */
struct SensorReading {
  uint8_t node_id;
  SensorPayload data;
  float rssi;
  float snr;
  unsigned long timestamp; // Unix timestamp
};

#define BUFFER_SIZE 50
SensorReading readingBuffer[BUFFER_SIZE];
int bufferHead = 0;
int bufferTail = 0;
int bufferCount = 0;

unsigned long lastUploadAttempt = 0;
const unsigned long UPLOAD_INTERVAL = 15000; // Check buffer every 15s

/* ---------- SX1278 PINS ---------- */
#define SS_PIN    5
#define RST_PIN   14
#define DIO0_PIN  2
#define Addressing_pin 15

const long LORA_FREQUENCY = 433E6;

/* ---------- GLOBALS ---------- */
char rxBuf[256];
uint8_t assignedNodeId = 2;

enum SystemState { MESH_STATE_POLLING, MESH_STATE_ADDRESSING, MESH_STATE_ROUTE_DISCOVERY };
SystemState currentState = MESH_STATE_ADDRESSING;

unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL = 10000;
const unsigned long RESPONSE_TIMEOUT = 3000;

/* ---------- FUNCTION DECLARATIONS ---------- */
void setupGSM();
bool sendAT(String cmd, const char* expected, unsigned long timeout);

void pushToBuffer(SensorReading reading);
void flushBufferToServer();
bool uploadBulkJson(String jsonString);

/* ========================================================= */
/* SETUP                                                     */
/* ========================================================= */
void setup()
{
  Serial.begin(115200);
  Serial2.begin(GSM_BAUDRATE, SERIAL_8N1, TXD2, RXD2);
  Serial2.setRxBufferSize(2048); // Large buffer for Bulk Uploads

  pinMode(Addressing_pin, INPUT_PULLUP);

  for (int i = 0; i < MAX_NODES; i++) {
    uidArray[i][0] = '\0';  
    nodeIdArray[i] = 0;
  }
  
  Serial.println("\n====== Enterprise LoRa Gateway (GSM) ======");
  Serial.println("Features: Offline Buffering, JSON Arrays, HTTPs POST");

  setupGSM();

  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, LOW);
  delay(10);
  digitalWrite(RST_PIN, HIGH);
  delay(100);

  SPI.begin(18, 19, 27, SS_PIN);
  LoRa.setPins(SS_PIN, RST_PIN, DIO0_PIN);

  if (!LoRa.begin(LORA_FREQUENCY)) {
    Serial.println("LoRa init failed");
    while (1);
  }

  LoRa.enableCrc();
  LoRa.setSyncWord(0x34);
  LoRa.setTxPower(20);
  LoRa.setSpreadingFactor(7);
  LoRa.setSignalBandwidth(125E3);
  LoRa.setCodingRate4(5);

  Serial.println("\nLoRa gateway ready. Starting in ADDRESSING MODE");
  LoRa.receive();
}

void loop()
{
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
  }

  checkStateChange();

  switch (currentState) {
    case MESH_STATE_POLLING:
      handlePollingMode();
      break;
    case MESH_STATE_ADDRESSING:
      handleAddressingMode();
      break;
    case MESH_STATE_ROUTE_DISCOVERY:
      break;
  }

  // Periodic Offline Buffer Flush
  if (millis() - lastUploadAttempt >= UPLOAD_INTERVAL) {
    if (bufferCount > 0) {
      flushBufferToServer();
    }
    lastUploadAttempt = millis();
  }
}

/* ========================================================= */
/* FAST GSM FUNCTIONS                                        */
/* ========================================================= */
bool sendAT(String cmd, const char* expected, unsigned long timeout) {
  while(Serial2.available()) Serial2.read();
  if (cmd != "") Serial2.println(cmd);
  
  unsigned long start = millis();
  String buffer = "";
  
  while (millis() - start < timeout) {
    if (Serial2.available()) {
      char c = Serial2.read();
      buffer += c;
      if (buffer.length() > 200) buffer = buffer.substring(100); 

      if (buffer.indexOf(expected) != -1) return true; 
      if (buffer.indexOf("ERROR") != -1) return false;
    }
  }
  return false; 
}

void setupGSM() {
  Serial.println("Init GSM...");
  sendAT("AT", "OK", 1000);
  sendAT("AT+CSQ", "OK", 1000); 
  if(!sendAT("AT+CGACT?", "+CGACT: 1,1", 2000)) {
      Serial.println("Activating Internet...");
      sendAT("AT+CGACT=1,1", "OK", 5000);
  }
  Serial.println("GSM Ready.");
}

/* ========================================================= */
/* BUFFERING & UPLOAD ENGINE (PHASE 3)                       */
/* ========================================================= */
void pushToBuffer(SensorReading reading) {
    if (bufferCount < BUFFER_SIZE) {
        readingBuffer[bufferHead] = reading;
        bufferHead = (bufferHead + 1) % BUFFER_SIZE;
        bufferCount++;
        Serial.printf("💾 Reading buffered. (Count: %d/%d)\n", bufferCount, BUFFER_SIZE);
    } else {
        Serial.println("⚠️ Buffer full! Dropping oldest data.");
        readingBuffer[bufferHead] = reading;
        bufferHead = (bufferHead + 1) % BUFFER_SIZE;
        bufferTail = (bufferTail + 1) % BUFFER_SIZE;
    }
}

void flushBufferToServer() {
    if (bufferCount == 0 || strlen(serverURL) == 0) return;
    
    // Quick GSM check
    if (!sendAT("AT+CSQ", "OK", 1000)) {
        Serial.println("📡 GSM Offline. Keeping data in RAM buffer.");
        return;
    }

    Serial.println("\n🚀 Initiating BULK Upload Sequence...");

    // Allocate ArduinoJson Document. Max 10 items per POST to save RAM
    int itemsToUpload = min(bufferCount, 10);
    DynamicJsonDocument doc(8000); 
    JsonArray array = doc.to<JsonArray>();

    int currentTail = bufferTail;
    unsigned long currentHardwareTime = millis() / 1000;

    for (int i = 0; i < itemsToUpload; i++) {
        SensorReading r = readingBuffer[currentTail];
        JsonObject obj = array.createNestedObject();
        
        obj["organization_id"] = 1; // Default
        obj["node_id"] = r.node_id;
        obj["timer_slave_id"] = r.data.timer_slave_id;
        obj["relay_no"] = r.data.relay_no;
        obj["ch_status"] = r.data.ch_status;
        obj["svf_rly_stat"] = r.data.svf_rly_stat ? true : false;
        obj["sys_ok"] = r.data.sys_ok ? true : false;
        obj["system_on"] = r.data.system_on ? true : false;
        obj["plc_interlock"] = r.data.plc_interlock ? true : false;
        obj["dp_interlock"] = r.data.dp_interlock ? true : false;
        obj["ip3_interlock"] = r.data.ip3_interlock ? true : false;
        obj["plc_interlock_stat"] = r.data.plc_interlock_stat ? true : false;
        obj["dp_interlock_stat"] = r.data.dp_interlock_stat ? true : false;
        obj["ip3_interlock_stat"] = r.data.ip3_interlock_stat ? true : false;
        obj["parallel_purge_mode"] = r.data.parallel_purge_mode ? true : false;
        obj["ch_open_1_16"] = r.data.ch_open_1_16;
        obj["ch_open_17_32"] = r.data.ch_open_17_32;
        obj["ch_open_33_48"] = r.data.ch_open_33_48;
        obj["ch_short_1_16"] = r.data.ch_short_1_16;
        obj["baud_rate"] = r.data.baud_rate;
        obj["reserved"] = r.data.reserved;
        obj["on_time_unit"] = r.data.on_time_unit;
        obj["on_time_lower_limit"] = r.data.on_time_lower_limit;
        obj["on_time_higher_limit"] = r.data.on_time_higher_limit;
        obj["off_time_unit"] = r.data.off_time_unit;
        obj["off_time_lower_limit"] = r.data.off_time_lower_limit;
        obj["off_time_higher_limit"] = r.data.off_time_higher_limit;
        obj["pause_time_unit"] = r.data.pause_time_unit;
        obj["pause_time_lower_limit"] = r.data.pause_time_lower_limit;
        obj["pause_time_higher_limit"] = r.data.pause_time_higher_limit;
        
        obj["differential_pressure"] = r.data.differential_pressure;
        obj["temp_in"] = r.data.temp_in;
        obj["temp_out"] = r.data.temp_out;
        obj["pressure_header"] = r.data.pressure_header;
        obj["particulate_matter"] = r.data.particulate_matter;
        obj["cleaning_status"] = r.data.cleaning_status;
        obj["rssi"] = r.rssi;
        obj["snr"] = r.snr;
        obj["timestamp"] = r.timestamp;
        obj["hardware_time"] = currentHardwareTime;

        currentTail = (currentTail + 1) % BUFFER_SIZE;
    }

    String jsonString;
    serializeJson(doc, jsonString);
    Serial.printf("📤 Payload Size: %d bytes\n", jsonString.length());

    bool success = uploadBulkJson(jsonString);

    if (success) {
        bufferTail = currentTail;
        bufferCount -= itemsToUpload;
        Serial.printf("✅ Bulk upload OK! Remaining in buffer: %d\n", bufferCount);
    } else {
        Serial.println("❌ Bulk upload FAILED. Keeping data in buffer.");
    }
}

bool uploadBulkJson(String jsonPayload) {
  sendAT("AT+HTTPTERM", "OK", 500); 
  sendAT("AT+CSSLCFG=\"sslversion\",0,3", "OK", 500); 
  sendAT("AT+CSSLCFG=\"authmode\",0,0", "OK", 500); 
  sendAT("AT+CSSLCFG=\"enableSNI\",0,1", "OK", 500); 

  if(!sendAT("AT+HTTPINIT", "OK", 1000)) return false;
  sendAT("AT+HTTPPARA=\"SSLCFG\",0", "OK", 500);
  if(!sendAT("AT+HTTPPARA=\"URL\",\"" + String(serverURL) + "\"", "OK", 1000)) return false;
  if(!sendAT("AT+HTTPPARA=\"CONTENT\",\"application/json\"", "OK", 1000)) return false;

  if(!sendAT("AT+HTTPDATA=" + String(jsonPayload.length()) + ",2000", "DOWNLOAD", 2000)) return false;
  
  Serial2.print(jsonPayload);
  if(!sendAT("", "OK", 3000)) return false;

  Serial2.println("AT+HTTPACTION=1");
  unsigned long start = millis();
  bool success = false;
  String respBuffer = "";
  
  while (millis() - start < 30000) {
    if (Serial2.available()) {
      char c = Serial2.read();
      respBuffer += c;
      if (respBuffer.indexOf("+HTTPACTION: 1,200") != -1 || respBuffer.indexOf("+HTTPACTION: 1,201") != -1) {
        success = true;
        break;
      }
      if (respBuffer.indexOf("+HTTPACTION: 1,") != -1 && 
          respBuffer.indexOf(",200") == -1 && 
          respBuffer.indexOf(",201") == -1) {
         if(respBuffer.length() > respBuffer.indexOf("+HTTPACTION: 1,") + 20) break; 
      }
    }
  }

  sendAT("AT+HTTPTERM", "OK", 500);
  return success;
}

/* ========================================================= */
/* DATA PARSING                                              */
/* ========================================================= */
void parseSensorData(const char *data, uint8_t nodeId, uint8_t payload_len)
{
    // Ensure the payload length strictly matches our new binary struct
    if (payload_len != sizeof(SensorPayload)) {
        Serial.printf("❌ Payload size mismatch! Expected %d, got %d. Make sure LoRa Slave is updated!\n", sizeof(SensorPayload), payload_len);
        return;
    }

    SensorReading reading;
    reading.node_id = nodeId;
    memcpy(&reading.data, data, sizeof(SensorPayload));
    reading.rssi = LoRa.packetRssi();
    reading.snr = LoRa.packetSnr();
    reading.timestamp = millis() / 1000; // Time since boot, or adapt to RTC
    
    Serial.println("📊 Binary Payload successfully parsed.");
    
    // Push to buffer instead of uploading immediately
    pushToBuffer(reading);
}

void checkStateChange() {
  static bool lastButtonState = HIGH;
  static unsigned long lastDebounceTime = 0;
  static bool modeChanged = false;
  bool currentButtonState = digitalRead(Addressing_pin);
  
  if (currentButtonState != lastButtonState) {
    lastDebounceTime = millis();
    modeChanged = false;
  }
  
  if ((millis() - lastDebounceTime) > 50) {
    if (currentButtonState == LOW && !modeChanged) {
      modeChanged = true;
      if (currentState == MESH_STATE_POLLING) {
        currentState = MESH_STATE_ADDRESSING;
        Serial.println("\n🎯 SWITCHED TO ADDRESSING MODE");
      } else {
        currentState = MESH_STATE_POLLING;
        Serial.println("\n📡 SWITCHED TO POLLING MODE");
      }
    }
    if (currentButtonState == HIGH) modeChanged = false;
  }
  lastButtonState = currentButtonState;
}

void handleAddressingMode() {
  static bool firstRun = true;
  if (firstRun) {
    Serial.println("\n=== ADDRESSING MODE ===");
    firstRun = false;
  }
  LoRa_reqaddress();
  delay(100);
}

void handlePollingMode() {
  static bool firstRun = true;
  if (firstRun) {
    Serial.println("\n=== POLLING MODE ===");
    firstRun = false;
  }
  if (millis() - lastPollTime >= POLL_INTERVAL) {
    LoRa_Polling();
    lastPollTime = millis();
  }
  delay(100);
}

void LoRa_reqaddress() {
  if (!LoRa.parsePacket()) return;
  MeshHeader hdr;
  if (LoRa.available() < sizeof(MeshHeader)) return;
  LoRa.readBytes((uint8_t*)&hdr, sizeof(MeshHeader));

  if (isDuplicate(hdr.src, hdr.msg_id)) {
    while (LoRa.available()) LoRa.read();
    return;
  }

  int i = 0;
  while (LoRa.available() && i < sizeof(rxBuf) - 1) rxBuf[i++] = (char)LoRa.read();
  rxBuf[i] = '\0';

  if (hdr.type != PKT_REQ_ADDRESS) return;

  uint32_t uid0, uid1, uid2;
  if (sscanf(rxBuf, "%08lX-%08lX-%08lX", &uid0, &uid1, &uid2) != 3) return;
  uint8_t existingId;
  if (getNodeIdForUID(uid0, uid1, uid2, &existingId)) {
    LoRa_registeraddress(uid0, uid1, uid2, existingId);
    rememberPacket(hdr.src, hdr.msg_id);
    return;
  }

  saveNodeIdForUID(uid0, uid1, uid2, assignedNodeId);
  LoRa_registeraddress(uid0, uid1, uid2, assignedNodeId);
  rememberPacket(hdr.src, hdr.msg_id);
  assignedNodeId++;
}

bool LoRa_registeraddress(uint32_t uid0, uint32_t uid1, uint32_t uid2, uint8_t nodeId) {
  char payload[128];
  snprintf(payload, sizeof(payload), "%08lX-%08lX-%08lX|%02d", uid0, uid1, uid2, nodeId);
  sendPacket(PKT_ACK_ADDRESS, 0xFF, payload);
  return true;
}

bool getNodeIdForUID(uint32_t u0, uint32_t u1, uint32_t u2, uint8_t *nodeId) {
  char uidStr[27];
  snprintf(uidStr, sizeof(uidStr), "%08lX-%08lX-%08lX", u0, u1, u2);
  for (int i = 0; i < nodeCount; i++) {
    if (strcmp(uidArray[i], uidStr) == 0) {
      *nodeId = nodeIdArray[i];
      return true;
    }
  }
  return false;
}

void saveNodeIdForUID(uint32_t u0, uint32_t u1, uint32_t u2, uint8_t nodeId) {
  char uidStr[27];
  snprintf(uidStr, sizeof(uidStr), "%08lX-%08lX-%08lX", u0, u1, u2);
  if (nodeCount < MAX_NODES) {
    strncpy(uidArray[nodeCount], uidStr, sizeof(uidArray[nodeCount]) - 1);
    uidArray[nodeCount][sizeof(uidArray[nodeCount]) - 1] = '\0';
    nodeIdArray[nodeCount] = nodeId;
    nodeCount++;
  }
}

uint8_t countRegisteredNodes() { return nodeCount; }

void LoRa_Polling() {
  nodeCount = countRegisteredNodes();
  if(nodeCount >= 1) {
    for(int i = 0; i < nodeCount; i++) {
      uint8_t nodeId = nodeIdArray[i];
      if (sendDataRequest(nodeId)) {
        waitForResponse(nodeId);
      }
      delay(500); 
    }
  }
}

bool sendDataRequest(uint8_t node) {
  char payload[8];
  snprintf(payload, sizeof(payload), "%02d", node);
  for (int attempt = 1; attempt <= REQ_MAX_RETRIES; attempt++) {
    uint16_t msgId = random(1, 65535);
    MeshHeader hdr;
    hdr.version = MESH_VERSION; hdr.type = PKT_REQ_DATA; hdr.src = MASTER_ID;
    hdr.dest = node; hdr.ttl = 1; hdr.flags = 0; hdr.msg_id = msgId; hdr.payload_len = (uint8_t)strlen(payload);
    LoRa.beginPacket();
    LoRa.write((uint8_t *)&hdr, sizeof(MeshHeader));
    LoRa.write((uint8_t *)payload, hdr.payload_len);
    LoRa.endPacket();
    LoRa.receive();
    if (waitForReqAck(node, msgId)) return true;
  }
  return false;
}

bool waitForResponse(uint8_t expectedNode) {
  unsigned long startTime = millis();
  while (millis() - startTime < RESPONSE_TIMEOUT) {
    if (!LoRa.parsePacket()) { delay(10); continue; }
    if (LoRa.available() < sizeof(MeshHeader)) { while (LoRa.available()) LoRa.read(); continue; }
    MeshHeader hdr;
    LoRa.readBytes((uint8_t *)&hdr, sizeof(MeshHeader));
    if (hdr.version != MESH_VERSION || hdr.payload_len >= sizeof(rxBuf)) { while (LoRa.available()) LoRa.read(); continue; }
    
    int i = 0;
    while (LoRa.available() && i < hdr.payload_len) rxBuf[i++] = (char)LoRa.read();
    rxBuf[i] = '\0';
    
    if (hdr.type != PKT_SENSOR_DATA || hdr.src != expectedNode) continue;
    
    parseSensorData(rxBuf, hdr.src, hdr.payload_len);
    sendAck(hdr.src, hdr.msg_id);
    return true; 
  }
  return false;
}

void sendPacket(uint8_t type, uint8_t dest, const char* payload) {
  MeshHeader hdr;
  hdr.version = MESH_VERSION; hdr.type = type; hdr.src = MASTER_ID; hdr.dest = dest;
  hdr.ttl = 5; hdr.flags = 0; hdr.msg_id = random(1, 65535);
  hdr.payload_len = payload ? (uint8_t)strlen(payload) : 0;
  LoRa.beginPacket();
  LoRa.write((uint8_t*)&hdr, sizeof(MeshHeader));
  if (payload && hdr.payload_len > 0) LoRa.write((uint8_t*)payload, hdr.payload_len);
  LoRa.endPacket();
  LoRa.receive();
}

void sendAck(uint8_t dest, uint16_t msgId) {
  MeshHeader hdr;
  hdr.version = MESH_VERSION; hdr.type = PKT_ACK; hdr.src = MASTER_ID; hdr.dest = dest;
  hdr.ttl = 1; hdr.flags = 0; hdr.msg_id = msgId; hdr.payload_len = 0;
  LoRa.beginPacket();
  LoRa.write((uint8_t *)&hdr, sizeof(MeshHeader));
  LoRa.endPacket();
  LoRa.receive();
}

bool waitForReqAck(uint8_t expectedNode, uint16_t msgId) {
  unsigned long start = millis();
  while (millis() - start < REQ_ACK_TIMEOUT_MS) {
    if (!LoRa.parsePacket()) { delay(10); continue; }
    if (LoRa.available() < sizeof(MeshHeader)) { while (LoRa.available()) LoRa.read(); continue; }
    MeshHeader hdr;
    LoRa.readBytes((uint8_t *)&hdr, sizeof(MeshHeader));
    if (hdr.type == PKT_ACK && hdr.src == expectedNode && hdr.msg_id == msgId) return true;
    while (LoRa.available()) LoRa.read();
  }
  return false;
}

bool isDuplicate(uint8_t src, uint16_t msg_id) {
  for (uint8_t i = 0; i < DUP_CACHE_SIZE; i++) {
    if (seenPackets[i].src == src && seenPackets[i].msg_id == msg_id) return true;
  }
  return false;
}

void rememberPacket(uint8_t src, uint16_t msg_id) {
  seenPackets[seenIndex].src = src; seenPackets[seenIndex].msg_id = msg_id;
  seenIndex++; if (seenIndex >= DUP_CACHE_SIZE) seenIndex = 0;
}
