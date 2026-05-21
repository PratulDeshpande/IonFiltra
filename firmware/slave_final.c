/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : LoRa Mesh Node (STM32) via custom LoRa library with Independent Modbus
  * @note           : REFACTORED FOR ENTERPRISE BINARY STRUCT PROTOCOL
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"
#include "spi.h"
#include "usart.h"
#include "gpio.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */
#include "LoRa.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
/* USER CODE END Includes */

/* Private typedef -----------------------------------------------------------*/
/* USER CODE BEGIN PTD */

/* ---------- LORA MESH CONFIGURATION ---------- */
#define MESH_VERSION          0x01

#define PKT_REQ_ADDRESS       0x01
#define PKT_ACK_ADDRESS       0x02
#define PKT_REQ_DATA          0x03
#define PKT_SENSOR_DATA       0x04
#define PKT_ACK               0x05
#define PKT_MASTER_ADV        0x06

#define MASTER_ID             1
#define BROADCAST             0xFF

#pragma pack(push, 1)
typedef struct {
  uint8_t  version;
  uint8_t  type;
  uint8_t  src;
  uint8_t  dest;
  uint8_t  ttl;
  uint8_t  flags;
  uint16_t msg_id;
  uint8_t  payload_len;
} MeshHeader;
#pragma pack(pop)

/* ---------- NEW ENTERPRISE SENSOR PAYLOAD (BINARY STRUCT) ---------- */
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
} SensorPayload;
#pragma pack(pop)

typedef enum {
    STATE_UNREGISTERED,
    STATE_REGISTERED
} NodeState;

/* USER CODE END PTD */

/* Private variables ---------------------------------------------------------*/

/* USER CODE BEGIN PV */
LoRa myLoRa;
uint16_t LoRa_status;
char uart_buf[256];
uint8_t rx_buffer[255]; // Max LoRa packet size

NodeState currentState = STATE_UNREGISTERED;
uint8_t myNodeId = 0; // 0 means unassigned
uint32_t myUID[3];    // To store the 96-bit Unique ID
char myUID_Str[32];   // Formatted UID string

uint32_t last_req_time = 0;

/* Modbus relies on standard USART */
extern UART_HandleTypeDef huart1;

// Global sensor variables updated by UART, read by LoRa
float modbus_dp = 0.0, modbus_t_in = 0.0, modbus_t_out = 0.0;
float modbus_p_header = 0.0, modbus_pm = 0.0;
int modbus_cleaning = 0;

// New Module 9 & Module 10 Registers (16-bit)
uint16_t on_time_unit = 0, on_time_lower = 0, on_time_higher = 0;
uint16_t off_time_unit = 0, off_time_lower = 0, off_time_higher = 0;
uint16_t pause_time_unit = 0, pause_lower = 0, pause_higher = 0;
uint16_t plc_interlock = 0, dp_interlock = 0, ip3_interlock = 0;

uint32_t last_modbus_poll_time = 0;

/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
/* USER CODE BEGIN PFP */
void Read_STM32_UID(void);
// [CHANGED] Updated to accept binary payload and explicit length
void Send_Mesh_Packet(uint8_t type, uint8_t dest, uint16_t msg_id, const uint8_t* payload, uint8_t payload_len);
int Receive_Mesh_Packet(MeshHeader* hdr, char* payload_out, uint32_t timeout_ms);
void Process_Unregistered_State(void);
void Process_Registered_State(void);

/* Modbus Functions */
uint16_t Modbus_CRC16(uint8_t *buf, uint8_t len);
int Modbus_Read_Sensors(void); 
/* USER CODE END PFP */

/* Private user code ---------------------------------------------------------*/
/* USER CODE BEGIN 0 */
/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  * @retval int
  */
int main(void)
{
  /* MCU Configuration--------------------------------------------------------*/
  HAL_Init();
  SystemClock_Config();
  MX_GPIO_Init();
  MX_SPI1_Init();
  MX_USART1_UART_Init();

  /* USER CODE BEGIN 2 */
  Read_STM32_UID();

  myLoRa = newLoRa(); 
  myLoRa.CS_port    = NSS_GPIO_Port;
  myLoRa.CS_pin     = NSS_Pin;
  myLoRa.reset_port = RESET_GPIO_Port;
  myLoRa.reset_pin  = RESET_Pin;
  myLoRa.DIO0_port  = DIO0_GPIO_Port;
  myLoRa.DIO0_pin   = DIO0_Pin;
  myLoRa.hSPIx      = &hspi1;

  LoRa_status = LoRa_init(&myLoRa);
  if (LoRa_status == LORA_OK) {
      LoRa_setSyncWord(&myLoRa, 0x34);
  }

  HAL_GPIO_WritePin(GPIOC, GPIO_PIN_14, GPIO_PIN_SET);
  /* USER CODE END 2 */

  while (1)
  {
      // 1. INDEPENDENT UART MODBUS POLLING
      if (HAL_GetTick() - last_modbus_poll_time > 1500) {
          last_modbus_poll_time = HAL_GetTick();

          modbus_dp = 0; modbus_t_in = 0; modbus_t_out = 0;
          modbus_p_header = 0; modbus_pm = 0; modbus_cleaning = 0;

          on_time_unit = 0; on_time_lower = 0; on_time_higher = 0;
          off_time_unit = 0; off_time_lower = 0; off_time_higher = 0;
          pause_time_unit = 0; pause_lower = 0; pause_higher = 0;
          plc_interlock = 0; dp_interlock = 0; ip3_interlock = 0;

          Modbus_Read_Sensors(); 
      }

      // 2. LORA MESH STATE MACHINE
      if (currentState == STATE_UNREGISTERED) {
    	  HAL_GPIO_WritePin(Erase_Led_GPIO_Port, Erase_Led_Pin, GPIO_PIN_SET);
          Process_Unregistered_State();
      }
      else if (currentState == STATE_REGISTERED) {
    	  HAL_GPIO_WritePin(Erase_Led_GPIO_Port, Erase_Led_Pin, GPIO_PIN_RESET);
          Process_Registered_State();
      }
  }
}

void SystemClock_Config(void)
{
  RCC_OscInitTypeDef RCC_OscInitStruct = {0};
  RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

  RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
  RCC_OscInitStruct.HSIState = RCC_HSI_ON;
  RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
  RCC_OscInitStruct.PLL.PLLState = RCC_PLL_NONE;
  if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK)
  {
    Error_Handler();
  }

  RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK|RCC_CLOCKTYPE_SYSCLK
                              |RCC_CLOCKTYPE_PCLK1|RCC_CLOCKTYPE_PCLK2;
  RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_HSI;
  RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
  RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV1;
  RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;

  if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_0) != HAL_OK)
  {
    Error_Handler();
  }
}

/* USER CODE BEGIN 4 */

void Read_STM32_UID(void)
{
    uint32_t *uid_ptr = (uint32_t *)UID_BASE;
    myUID[0] = uid_ptr[0];
    myUID[1] = uid_ptr[1];
    myUID[2] = uid_ptr[2];

    snprintf(myUID_Str, sizeof(myUID_Str), "%08lX-%08lX-%08lX", myUID[0], myUID[1], myUID[2]);
}

// [CHANGED] Updated to accept binary payload_len to avoid strlen bugs with 0x00 bytes
void Send_Mesh_Packet(uint8_t type, uint8_t dest, uint16_t msg_id, const uint8_t* payload, uint8_t payload_len)
{
    MeshHeader hdr;
    hdr.version = MESH_VERSION;
    hdr.type    = type;
    hdr.src     = (currentState == STATE_REGISTERED) ? myNodeId : 0;
    hdr.dest    = dest;
    hdr.ttl     = 1;
    hdr.flags   = 0;

    if (msg_id == 0) {
        hdr.msg_id = (uint16_t)(HAL_GetTick() & 0xFFFF);
    } else {
        hdr.msg_id = msg_id;
    }

    hdr.payload_len = payload_len;

    uint8_t tx_buffer[255];
    uint16_t total_len = sizeof(MeshHeader) + hdr.payload_len;

    if(total_len > 255) return;

    memcpy(tx_buffer, &hdr, sizeof(MeshHeader));
    if (hdr.payload_len > 0 && payload != NULL) {
        memcpy(tx_buffer + sizeof(MeshHeader), payload, hdr.payload_len);
    }

    LoRa_transmit(&myLoRa, tx_buffer, total_len, 500);
}

int Receive_Mesh_Packet(MeshHeader* hdr, char* payload_out, uint32_t timeout_ms)
{
    uint32_t start_time = HAL_GetTick();
    LoRa_startReceiving(&myLoRa);

    while ((HAL_GetTick() - start_time) < timeout_ms)
    {
        uint8_t rx_len = LoRa_receive(&myLoRa, rx_buffer, sizeof(rx_buffer));
        if (rx_len >= sizeof(MeshHeader))
        {
            memcpy(hdr, rx_buffer, sizeof(MeshHeader));
            if (hdr->payload_len > 0 && hdr->payload_len <= (rx_len - sizeof(MeshHeader)))
            {
                memcpy(payload_out, rx_buffer + sizeof(MeshHeader), hdr->payload_len);
                payload_out[hdr->payload_len] = '\0';
            } else {
                payload_out[0] = '\0';
            }

            LoRa_gotoMode(&myLoRa, 1);
            return 1;
        }
        HAL_Delay(10);
    }

    LoRa_gotoMode(&myLoRa, 1);
    return 0;
}

void Process_Unregistered_State(void)
{
    if ((HAL_GetTick() - last_req_time) > 5000)
    {
        // [CHANGED] Pass strlen for the UID string explicitly
        Send_Mesh_Packet(PKT_REQ_ADDRESS, BROADCAST, 0, (const uint8_t*)myUID_Str, (uint8_t)strlen(myUID_Str));
        last_req_time = HAL_GetTick();
    }

    MeshHeader hdr;
    char payload[128];

    if (Receive_Mesh_Packet(&hdr, payload, 500))
    {
        if (hdr.type == PKT_ACK_ADDRESS)
        {
            if (strncmp(payload, myUID_Str, strlen(myUID_Str)) == 0)
            {
                char* delim = strchr(payload, '|');
                if (delim != NULL)
                {
                    myNodeId = atoi(delim + 1);
                    currentState = STATE_REGISTERED;

                    for(int i = 0; i < 4; i++) {
                        HAL_GPIO_TogglePin(GPIOC, GPIO_PIN_14);
                        HAL_Delay(100);
                    }
                    HAL_GPIO_WritePin(GPIOC, GPIO_PIN_14, GPIO_PIN_RESET);
                }
            }
        }
    }
}

uint16_t Modbus_CRC16(uint8_t *buf, uint8_t len)
{
    uint16_t crc = 0xFFFF;
    for (int pos = 0; pos < len; pos++) {
        crc ^= (uint16_t)buf[pos];
        for (int i = 8; i != 0; i--) {
            if ((crc & 0x0001) != 0) {
                crc >>= 1; crc ^= 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

int Modbus_Read_Sensors(void)
{
    int status = 0;

    // POLL 1
    uint8_t tx_frame1[8] = {0x01, 0x03, 0x00, 0x00, 0x00, 0x0B, 0x00, 0x00};
    uint16_t tx_crc1 = Modbus_CRC16(tx_frame1, 6);
    tx_frame1[6] = tx_crc1 & 0xFF;
    tx_frame1[7] = (tx_crc1 >> 8) & 0xFF;

    __HAL_UART_FLUSH_DRREGISTER(&huart1);

    if (HAL_UART_Transmit(&huart1, tx_frame1, 8, 100) == HAL_OK) {
        uint8_t rx_frame1[27];
        if (HAL_UART_Receive(&huart1, rx_frame1, 27, 200) == HAL_OK) {
            uint16_t rx_crc1 = Modbus_CRC16(rx_frame1, 25);
            if (rx_frame1[25] == (rx_crc1 & 0xFF) && rx_frame1[26] == ((rx_crc1 >> 8) & 0xFF)) {
                union { uint32_t i; float f; } u;

                u.i = ((uint32_t)rx_frame1[3] << 24) | ((uint32_t)rx_frame1[4] << 16) | ((uint32_t)rx_frame1[5] << 8) | rx_frame1[6];
                modbus_dp = u.f;
                u.i = ((uint32_t)rx_frame1[7] << 24) | ((uint32_t)rx_frame1[8] << 16) | ((uint32_t)rx_frame1[9] << 8) | rx_frame1[10];
                modbus_t_in = u.f;
                u.i = ((uint32_t)rx_frame1[11] << 24) | ((uint32_t)rx_frame1[12] << 16) | ((uint32_t)rx_frame1[13] << 8) | rx_frame1[14];
                modbus_t_out = u.f;
                u.i = ((uint32_t)rx_frame1[15] << 24) | ((uint32_t)rx_frame1[16] << 16) | ((uint32_t)rx_frame1[17] << 8) | rx_frame1[18];
                modbus_p_header = u.f;
                u.i = ((uint32_t)rx_frame1[19] << 24) | ((uint32_t)rx_frame1[20] << 16) | ((uint32_t)rx_frame1[21] << 8) | rx_frame1[22];
                modbus_pm = u.f;
                modbus_cleaning = (rx_frame1[23] << 8) | rx_frame1[24];
                status = 1;
            }
        }
    }

    HAL_Delay(20); 

    // POLL 2
    uint8_t tx_frame2[8] = {0x01, 0x03, 0x00, 0x92, 0x00, 0x19, 0x00, 0x00};
    uint16_t tx_crc2 = Modbus_CRC16(tx_frame2, 6);
    tx_frame2[6] = tx_crc2 & 0xFF;
    tx_frame2[7] = (tx_crc2 >> 8) & 0xFF;

    __HAL_UART_FLUSH_DRREGISTER(&huart1);

    if (HAL_UART_Transmit(&huart1, tx_frame2, 8, 100) == HAL_OK) {
        uint8_t rx_frame2[55];
        if (HAL_UART_Receive(&huart1, rx_frame2, 55, 200) == HAL_OK) {
            uint16_t rx_crc2 = Modbus_CRC16(rx_frame2, 53);
            if (rx_frame2[53] == (rx_crc2 & 0xFF) && rx_frame2[54] == ((rx_crc2 >> 8) & 0xFF)) {
                on_time_unit    = (rx_frame2[3] << 8)  | rx_frame2[4];    
                on_time_lower   = (rx_frame2[7] << 8)  | rx_frame2[8];    
                on_time_higher  = (rx_frame2[11] << 8) | rx_frame2[12];   
                off_time_unit   = (rx_frame2[15] << 8) | rx_frame2[16];   
                off_time_lower  = (rx_frame2[19] << 8) | rx_frame2[20];   
                off_time_higher = (rx_frame2[23] << 8) | rx_frame2[24];   
                pause_time_unit = (rx_frame2[27] << 8) | rx_frame2[28];   
                pause_lower     = (rx_frame2[31] << 8) | rx_frame2[32];   
                pause_higher    = (rx_frame2[35] << 8) | rx_frame2[36];   

                plc_interlock   = (rx_frame2[39] << 8) | rx_frame2[40];   
                dp_interlock    = (rx_frame2[43] << 8) | rx_frame2[44];   
                ip3_interlock   = (rx_frame2[51] << 8) | rx_frame2[52];   
                status = 1;
            }
        }
    }

    return status;
}

void Process_Registered_State(void)
{
    MeshHeader hdr;
    char rx_payload[128];

    if (Receive_Mesh_Packet(&hdr, rx_payload, 500))
    {
        if (hdr.dest != myNodeId) return;

        if (hdr.type == PKT_REQ_DATA && hdr.src == MASTER_ID)
        {
            // [CHANGED] explicitly pass NULL and 0 length
            Send_Mesh_Packet(PKT_ACK, MASTER_ID, hdr.msg_id, NULL, 0);
            HAL_Delay(150);

            // [CHANGED] Pack the new binary struct instead of CSV
            SensorPayload outData;
            memset(&outData, 0, sizeof(SensorPayload));
            
            // Set defaults to keep the backend happy and prevent false alarms
            outData.sys_ok = 1; 
            outData.system_on = 1;
            outData.timer_slave_id = myNodeId;
            outData.baud_rate = 9600;
            outData.ch_status = 1;

            // Map the parsed Modbus variables
            outData.on_time_unit = (uint8_t)on_time_unit;
            outData.on_time_lower_limit = on_time_lower;
            outData.on_time_higher_limit = on_time_higher;
            outData.off_time_unit = (uint8_t)off_time_unit;
            outData.off_time_lower_limit = off_time_lower;
            outData.off_time_higher_limit = off_time_higher;
            outData.pause_time_unit = (uint8_t)pause_time_unit;
            outData.pause_time_lower_limit = pause_lower;
            outData.pause_time_higher_limit = pause_higher;

            // The STM32 reads these interlocks from Modbus
            outData.plc_interlock_stat = (uint8_t)plc_interlock;
            outData.dp_interlock_stat = (uint8_t)dp_interlock;
            outData.ip3_interlock_stat = (uint8_t)ip3_interlock;

            // Transmit the struct as raw bytes
            Send_Mesh_Packet(PKT_SENSOR_DATA, MASTER_ID, 0, (const uint8_t*)&outData, sizeof(SensorPayload));

            HAL_GPIO_WritePin(Erase_Led_GPIO_Port, Erase_Led_Pin, GPIO_PIN_SET);
            HAL_Delay(100);
            HAL_GPIO_WritePin(Erase_Led_GPIO_Port, Erase_Led_Pin, GPIO_PIN_RESET);
        }
    }
}
/* USER CODE END 4 */

void Error_Handler(void)
{
  __disable_irq();
  while (1) { }
}

#ifdef  USE_FULL_ASSERT
void assert_failed(uint8_t *file, uint32_t line) { }
#endif /* USE_FULL_ASSERT */
