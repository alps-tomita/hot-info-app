/**
 * HOT情報管理システム
 * 飲食店営業情報を管理するためのスクリプト
 */

// スプレッドシートID（重要）
const SPREADSHEET_ID = "1Eo_kM5fDs8jHzcDI4vCpx5kCxevbLhJqx48WNPh3p04";

function doGet(e) {
  // パラメータがある場合はデータ追加処理
  if (e.parameter && Object.keys(e.parameter).length > 0) {
    try {
      // データシート取得（IDで直接指定）
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const sheet = ss.getSheetByName("データ受信用");
      
      // シートが見つからない場合
      if (!sheet) {
        throw new Error("「データ受信用」シートが見つかりません。シート名を確認してください。");
      }
      
      // GETパラメータ取得
      const params = e.parameter;
      
      // データ追加
      sheet.appendRow([
        new Date(),
        params.route || "",
        params.latitude || "",
        params.longitude || "",
        params.category || "",
        params.comment || "",
        params.imageUrl || "",
        params.address || ""
      ]);
      
      // 送信成功画面のHTMLを作成
      const htmlContent = `<!DOCTYPE html>
         <html>
           <head>
             <meta charset="UTF-8">
             <title>HOT情報管理システム - 送信完了</title>
             <style>
               body { font-family: Arial, sans-serif; margin: 40px; text-align: center; }
               .success { color: green; font-size: 24px; margin: 20px 0; }
               .details { background: #f5f5f5; padding: 20px; border-radius: 5px; text-align: left; margin: 20px 0; }
             </style>
           </head>
           <body>
             <h1>HOT情報管理システム</h1>
             <div class="success">データ送信に成功しました！</div>
             <div class="details">
               <p>送信情報:</p>
               <ul>
                 <li>ルート名: ${params.route || "未設定"}</li>
                 <li>緯度: ${params.latitude || "未設定"}</li>
                 <li>経度: ${params.longitude || "未設定"}</li>
                 <li>カテゴリ: ${params.category || "未設定"}</li>
                 <li>コメント: ${params.comment || "未設定"}</li>
               </ul>
             </div>
             <p><a href="javascript:window.close();">このウィンドウを閉じる</a></p>
           </body>
         </html>`;
      
      // HtmlServiceでレスポンス作成（CORS対応）
      const htmlOutput = HtmlService.createHtmlOutput(htmlContent)
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      
      return htmlOutput;
    } catch (error) {
      // エラー発生時のHTML作成
      const errorContent = `<!DOCTYPE html>
         <html>
           <head>
             <meta charset="UTF-8">
             <title>HOT情報管理システム - エラー</title>
             <style>
               body { font-family: Arial, sans-serif; margin: 40px; text-align: center; }
               .error { color: red; font-size: 24px; margin: 20px 0; }
               .details { background: #f5f5f5; padding: 20px; border-radius: 5px; text-align: left; margin: 20px 0; }
             </style>
           </head>
           <body>
             <h1>HOT情報管理システム</h1>
             <div class="error">エラーが発生しました</div>
             <p>${error.toString()}</p>
             <div class="details">
               <p>エラーの詳細情報:</p>
               <pre>${error.stack || "詳細情報なし"}</pre>
             </div>
             <p><a href="javascript:window.close();">このウィンドウを閉じる</a></p>
           </body>
         </html>`;
      
      // HtmlServiceでレスポンス作成（CORS対応）
      const htmlOutput = HtmlService.createHtmlOutput(errorContent)
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      
      return htmlOutput;
    }
  }
  
  // クエリパラメータがresultFormatをJSONに指定した場合はJSON形式で返す（API利用向け）
  if (e.parameter && e.parameter.resultFormat === 'json') {
    const output = ContentService.createTextOutput(JSON.stringify({
      "status": "ok",
      "message": "HOT情報管理システムのAPIです"
    }));
    output.setMimeType(ContentService.MimeType.JSON);
    
    // CORS設定用のヘッダー
    output.setHeader("Access-Control-Allow-Origin", "*");
    output.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    output.setHeader("Access-Control-Allow-Headers", "Content-Type");
    
    return output;
  }
  
  // 通常アクセス時はHTMLでAPIの情報を表示
  const htmlOutput = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>HOT情報管理システム API</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; text-align: center; }
          .api-info { background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <h1>HOT情報管理システム</h1>
        <div class="api-info">
          <p>HOT情報管理システムのAPIです</p>
        </div>
      </body>
    </html>
  `).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  
  return htmlOutput;
}

// プリフライトリクエスト（OPTIONS）への対応
function doOptions(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(30000);
  
  try {
    var output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);
    output.setContent(JSON.stringify({"status": "success"}));
    
    // CORS設定用のヘッダー
    output.setHeader("Access-Control-Allow-Origin", "*");
    output.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    output.setHeader("Access-Control-Allow-Headers", "Content-Type");
    output.setHeader("Access-Control-Max-Age", "86400");
    
    return output;
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  try {
    // パラメータ取得
    const params = JSON.parse(e.postData.contents);
    
    // データシート取得（IDで直接指定）
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName("データ受信用");
    
    // シートが見つからない場合
    if (!sheet) {
      throw new Error("「データ受信用」シートが見つかりません。シート名を確認してください。");
    }
    
    // データ追加
    sheet.appendRow([
      new Date(),
      params.route || "",
      params.latitude || "",
      params.longitude || "",
      params.category || "",
      params.comment || "",
      params.imageUrl || "",
      params.address || "" // 住所フィールド追加
    ]);
    
    // レスポンス作成
    var output = ContentService.createTextOutput(JSON.stringify({
      "result": "success"
    }));
    output.setMimeType(ContentService.MimeType.JSON);
    
    // CORS設定用のヘッダー
    output.setHeader("Access-Control-Allow-Origin", "*");
    output.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    output.setHeader("Access-Control-Allow-Headers", "Content-Type");
    
    return output;
    
  } catch (error) {
    // エラーレスポンス作成
    var output = ContentService.createTextOutput(JSON.stringify({
      "result": "error",
      "message": error.toString()
    }));
    output.setMimeType(ContentService.MimeType.JSON);
    
    // CORS設定用のヘッダー
    output.setHeader("Access-Control-Allow-Origin", "*");
    output.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    output.setHeader("Access-Control-Allow-Headers", "Content-Type");
    
    return output;
  }
}

// グローバル変数（画像保存用フォルダID）
const FOLDER_ID = "1rOGg_2inKeXyB-7z27q-Wycs8wM4l5VU"; // HOT情報画像フォルダのID

// 画像処理用関数（今後使用）
function saveImageToFolder(base64Image, fileName) {
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Image), 'image/jpeg', fileName);
    const file = folder.createFile(blob);
    return file.getUrl();
  } catch (error) {
    console.error("画像保存エラー: " + error.toString());
    return null;
  }
} 