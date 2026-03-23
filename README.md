# ESP Web Flasher (Local Repository Storage)

A browser-based firmware flashing platform for ESP32 and ESP8266 devices. This version is designed for **offline/local repository usage**, where firmware binaries are stored directly within the GitHub repository.

---

## 📁 File Structure

```
ESP_Flasher/
├── firmware/
│   └── esp32c3_blinky/
│       └── esp32c3_blinky.bin  <-- Your firmware binary
├── index.html                  <-- Main UI
├── style.css                   <-- Premium UI Styling
├── app.js                      <-- Flash Logic (Clean No-Firebase)
└── config.json                 <-- Project Manifest
```

---

## 🚀 Setup & Usage

### 1. Add Your Firmware
Place your `.bin` files in the `firmware/` directory. It is best to organize them by project name.

### 2. Update `config.json`
Add your project details to the `projects` array. The flasher supports all major ESP chips.

#### 🔧 Configuration Parameters:
- **`id`**: Unique identifier for the project.
- **`chip`**: The target chip type. Supported: `ESP32`, `ESP8266`, `ESP32S2`, `ESP32S3`, `ESP32C3`, `ESP32C6`, `ESP32H2`.
- **`flash_size`**: The size of the flash memory (e.g., `4MB`, `2MB`, `8MB`).
- **`baud_default`**: Recommended baud rate for flashing (usually `460800` or `921600`).
- **`flash`**: Array of binary objects with `address` (e.g., `0x0`, `0x1000`, `0x8000`) and `file_id`.

#### 📝 Example Config:
```json
{
  "projects": [
    {
      "id": "esp32c3_blinky",
      "name": "Blinky for ESP32-C3",
      "chip": "ESP32C3",
      "flash_size": "4MB",
      "baud_default": 460800,
      "flash": [
        { "address": "0x0", "file_id": "esp32c3_blinky.bin", "label": "Main App" }
      ]
    }
  ]
}
```

### ⚡ Chip-Specific Guidance

While the flasher is universal, different chips require specific configurations in `config.json`:

| Chip Target | Recommended Address | Common Flash Sizes | Notes |
| :--- | :--- | :--- | :--- |
| **ESP32** | `0x1000` (Boot) / `0x10000` (App) | 4MB, 16MB | Standard dual-core |
| **ESP32-C3** | `0x0` | 4MB | Single-core RISC-V |
| **ESP32-S3** | `0x0` | 8MB, 16MB | High-performance with USB |
| **ESP8266** | `0x0` | 1MB, 4MB | Legacy support |

> [!TIP]
> Always verify your chip's flash size using the **esptool** or device datasheet. Incorrect `flash_size` settings can lead to "Flash failed: MD5 mismatch" errors if the image exceeds the boundary.

### 🌐 WordPress & External Integration

You can easily integrate the ESP Flasher into your WordPress site or any existing CMS:

#### 1. The Iframe Method (Recommended)
Add a **Custom HTML** block to your WordPress page and paste the following snippet:

```html
<iframe 
  src="https://your-username.github.io/ESP_Flasher/" 
  style="width:100%; height:800px; border:none; border-radius:12px;" 
  allow="serial"
></iframe>
```
> [!IMPORTANT]
> You **MUST** include `allow="serial"`. Without this, the browser will block the flasher from accessing your device's USB port for security reasons.

#### 2. The Direct Folder Method (for `/tools/` slug)
If you want to host it directly under a specific URL like `yourdomain.com/tools/`:
1.  Download or Clone this repository.
2.  Rename the main folder from `ESP_Flasher` to `tools`.
3.  Upload the entire `tools` folder to your WordPress root directory (via FTP or your host's File Manager).
4.  Your flasher will now be live at `https://yourdomain.com/tools/`.

---

### 🚀 Deploy to GitHub Pages
1. Push your code to a GitHub repository.
2. Go to **Settings → Pages**.
3. Set the source to the `main` branch and the folder to `/` (root).
4. Your flasher will be live at `https://your-username.github.io/your-repo-name/`.

---

## 🔒 Security & Privacy
- **No Cloud Required**: This version does not use Firebase or any external database.
- **Privacy**: No user data is collected. All flashing happens entirely in the browser via Web Serial API.
- **Local Access**: Firmware is fetched using relative paths from your repository.

---

## 🛠️ Tech Stack
- **Web Serial API**: Native browser communication with hardware.
- **esptool-js**: The core flashing engine.
- **Vanilla JS/CSS**: Fast, lightweight, and framework-free.
