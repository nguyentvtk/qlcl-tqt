# Cách lấy Google Service Account

## Bước 1: Tạo Service Account
1. Vào https://console.cloud.google.com/
2. Tạo project mới hoặc chọn project hiện có
3. Vào **APIs & Services > Credentials > Create Credentials > Service Account**
4. Đặt tên, chọn role "Editor", nhấn Done

## Bước 2: Tạo JSON key
1. Click vào Service Account vừa tạo
2. Tab **Keys > Add Key > Create new key > JSON**
3. Tải file JSON về, đổi tên thành `service_account.json`
4. Đặt file vào thư mục `credentials/`

## Bước 3: Bật Google Sheets API
1. Vào **APIs & Services > Library**
2. Tìm "Google Sheets API" và bật
3. Tìm "Google Drive API" và bật

## Bước 4: Chia sẻ Spreadsheet với Service Account
1. Mở Google Sheets: https://docs.google.com/spreadsheets/d/1LsaccoqTu3sRaElEWVdCZjXlzRL_2N2DPPP3UiInDEk/
2. Nhấn **Share**
3. Thêm email của Service Account (tìm trong file JSON, trường `client_email`)
4. Cấp quyền **Editor**

## File cần tạo
```
credentials/
└── service_account.json   ← Đặt file JSON key tại đây
```

## QUAN TRỌNG
- KHÔNG commit file `service_account.json` lên git (đã có trong .gitignore)
- File chứa private key, bảo mật tuyệt đối
