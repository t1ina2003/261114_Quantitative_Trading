# Quant Quest｜量化交易闖關實驗室

以繁體中文、手機友善的互動網頁，練習量化交易的基本流程：**定義規則 → 訓練回測 → 樣本外測試 → 風險評估**。

## 功能

- 內建**明確標示的合成價格**，含多種不同市場情境，絕不冒充實際歷史行情。
- 可調整均線趨勢或跌深反彈策略，與買入持有比較。
- 可設定交易成本、觀察總報酬、最大回撤、交易次數。
- 隱藏測試期間，避免只挑出歷史上看起來漂亮的參數。
- 在瀏覽器本機匯入 CSV：`Date,Close` 或 `Date,Adj Close`，不會上傳到伺服器。
- 純 HTML/CSS/JavaScript，GitHub Pages 不需建置工具或 API Key。

## Git Flow

- `main`：正式發布 / GitHub Pages（`/ (root)`）
- `develop`：整合開發
- `feature/*`：功能開發

## GitHub Pages

在 Settings → Pages → Build and deployment 設定 **Deploy from a branch**、**main**、**/ (root)**，儲存即可。

專案預計部署網址：`https://t1ina2003.github.io/261114_Quantitative_Trading/`

> 僅供量化交易教學與回測實驗，不構成投資建議。模擬績效不代表未來報酬；模型未包含股利、稅務、流動性、滑價、融資成本與全部市場摩擦。