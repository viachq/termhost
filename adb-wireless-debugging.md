# ADB Wireless Debugging

## Чому вимикається автоматично

Android автоматично вимикає Wireless debugging через ~5-10 хв без активності (вбудована політика безпеки Google).

## Як вимкнути таймаут

```powershell
adb shell settings put global adb_wifi_timeout_ms 0
```

## Як повернути дефолтне значення

```powershell
adb shell settings delete global adb_wifi_timeout_ms
```

## Як перевірити поточне значення

```powershell
adb shell settings get global adb_wifi_timeout_ms
```

- `null` — стандартний таймаут (~5-10 хв)
- `0` — таймаут вимкнено
- будь-яке інше число — таймаут у мілісекундах

## Наше підключення

- Пристрій: `SM-A245F` (Samsung A24)
- Тип: Wireless debugging через TLS
