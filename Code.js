/**
 * HOT情報管理システム
 * 飲食店営業情報を管理するためのスクリプト
 */

// スプレッドシートID（重要）
const SPREADSHEET_ID = "1Eo_kM5fDs8jHzcDI4vCpx5kCxevbLhJqx48WNPh3p04";

// スプレッドシートアクセスの共通関数（エラーハンドリング強化）
function getOrCreateSheet(spreadsheetId, sheetName, headers) {
    try {
      // スプレッドシートを開く
    const ss = SpreadsheetApp.openById(spreadsheetId);
    if (!ss) {
      throw new Error(`スプレッドシートが見つかりません: ${spreadsheetId}`);
    }
    
    // シートを取得
    let sheet = ss.getSheetByName(sheetName);
    console.log(`シート「${sheetName}」の検索: ${sheet ? '見つかりました' : '見つかりません'}`);
    
    // シートがなければ作成
    if (!sheet) {
      console.log(`シート「${sheetName}」を新規作成します`);
      sheet = ss.insertSheet(sheetName);
      
      // ヘッダーを設定
      if (headers && headers.length > 0) {
        sheet.appendRow(headers);
        
        // 列の幅を調整
        sheet.setColumnWidth(1, 150); // タイムスタンプ
        headers.forEach((header, index) => {
          if (header.includes('コメント') || header.includes('URL') || header.includes('データ')) {
            sheet.setColumnWidth(index + 1, 250);
          }
        });
        
        // 最初の行を固定
        sheet.setFrozenRows(1);
      }
    }
    
    return sheet;
  } catch (error) {
    console.error(`シート「${sheetName}」の取得/作成中にエラーが発生しました: ${error.toString()}`);
    logData("シートアクセスエラー", {
      error: error.toString(),
      spreadsheetId: spreadsheetId,
      sheetName: sheetName
    });
    throw error;
  }
}

// デバッグ関数：データの内容をログに記録
function logData(prefix, data) {
  if (!data) return;
  
  console.log(prefix + "：", JSON.stringify(data));
  
  // スプレッドシートにもデバッグログを記録
  try {
    const logSheet = getOrCreateSheet(
      SPREADSHEET_ID, 
      "デバッグログ", 
      ["タイムスタンプ", "プレフィックス", "データ"]
    );
    
    logSheet.appendRow([new Date(), prefix, JSON.stringify(data)]);
    } catch (error) {
    console.error("デバッグログの記録に失敗: " + error.toString());
  }
}

/**
 * GET リクエストを処理する関数 (GAS Web アプリケーションのエントリーポイント)
 * @param {Object} e - リクエストパラメータ
 * @return {TextOutput} レスポンス
 */
function doGet(e) {
  try {
    // リクエストパラメータをログに記録
    console.log('GETリクエスト:', JSON.stringify(e.parameter));
    
    // リクエストタイプの取得
    const requestType = e.parameter.requestType || '';
    const callback = e.parameter.callback || null; // JSONPコールバック関数名
    
    let responseData = {};
    
    // リクエストタイプに応じた処理
    if (requestType === 'routes') {
      // ルート一覧をスプレッドシートから取得
      try {
        const routes = getRoutesList();
        responseData = {
          status: 'ok',
          routes: routes
        };
      } catch (routeError) {
        console.error('ルート一覧取得エラー:', routeError);
        responseData = {
          status: 'error',
          message: 'ルート一覧の取得に失敗しました: ' + routeError.message,
          routes: []
        };
      }
    } else {
      // フォームデータの保存
      const route = e.parameter.route || '';
      const value = e.parameter.value || '';
      
      // データを保存
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const sheet = ss.getSheetByName('GETリクエスト') || ss.insertSheet('GETリクエスト');
      
      // 現在時刻を取得
      const now = new Date();
      
      // データを1行追加
      sheet.appendRow([now, route, value]);
      
      // レスポンスデータを作成
      responseData = {
        status: 'ok',
        message: 'データを正常に記録しました',
        details: {
          route: route,
          value: value,
          timestamp: now.toISOString()
        }
      };
    }
    
    // レスポンスの生成
    const jsonString = JSON.stringify(responseData);
    
    // JSONPの場合はコールバック関数でラップして返す
    if (callback) {
      const content = callback + "(" + jsonString + ");";
      const output = ContentService.createTextOutput(content);
      output.setMimeType(ContentService.MimeType.JAVASCRIPT);
      return output;
    } else {
      // 通常のJSONレスポンスを返す
      const output = ContentService.createTextOutput(jsonString);
      output.setMimeType(ContentService.MimeType.JSON);
    return output;
  }
  
  } catch (error) {
    // エラーをログに記録
    console.error('エラー発生:', error.message, error.stack);
    
    // エラーレスポンスを生成
    const errorResponse = {
      status: 'error',
      message: error.message
    };
    
    const jsonString = JSON.stringify(errorResponse);
    
    // コールバック関数の有無に応じたレスポンス形式を選択
    const callback = e.parameter.callback || null;
    if (callback) {
      const content = callback + "(" + jsonString + ");";
      const output = ContentService.createTextOutput(content);
      output.setMimeType(ContentService.MimeType.JAVASCRIPT);
      return output;
    } else {
      const output = ContentService.createTextOutput(jsonString);
      output.setMimeType(ContentService.MimeType.JSON);
      return output;
    }
  }
}

/**
 * HTTP POSTリクエスト処理関数
 */
function doPost(e) {
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  
  try {
    var data = {};
    // POSTデータの処理
    if (e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (parseError) {
        output.setContent(JSON.stringify({
          status: "error",
          message: "JSONパースエラー: " + parseError.toString(),
          timestamp: new Date().toISOString()
        }));
        return output;
      }
    }
    
    // デバッグログを残す
    console.log("POSTリクエスト受信: " + JSON.stringify(data));
    
    // データをスプレッドシートに保存
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = spreadsheet.getSheetByName("提出データ");
    if (!sheet) {
      sheet = spreadsheet.insertSheet("提出データ");
      sheet.appendRow(["タイムスタンプ", "ルート", "緯度", "経度", "住所", "画像URL", "詳細情報", "リクエスト元"]);
    }
    
    // データの保存
    sheet.appendRow([
      new Date(),
      data.route || "",
      data.latitude || "",
      data.longitude || "",
      data.address || "",
      data.imageUrl || "",
      data.details || "",
      e.postData.type || "Unknown"
    ]);
    
    output.setContent(JSON.stringify({
      status: "ok",
      message: "データを保存しました",
      timestamp: new Date().toISOString(),
      id: sheet.getLastRow() - 1
    }));
    return output;
  } catch (error) {
    output.setContent(JSON.stringify({
      status: "error",
      message: "POSTデータ処理エラー: " + error.toString(),
      timestamp: new Date().toISOString()
    }));
    return output;
  }
}

/**
 * HTTP OPTIONSリクエスト処理関数（CORS対応用）
 */
function doOptions(e) {
  var output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.TEXT);
  return output;
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

/**
 * 診断用：スプレッドシートの構造を確認
 */
function checkSpreadsheetStructure() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = spreadsheet.getSheets();
  var result = {
    name: spreadsheet.getName(),
    url: spreadsheet.getUrl(),
    sheets: []
  };
  
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    result.sheets.push({
      name: sheet.getName(),
      rows: sheet.getLastRow(),
      cols: sheet.getLastColumn()
    });
  }
  
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * テスト用：ルート一覧が正しく取得できるかテスト
 */
function testGetRoutes() {
  var mockRequest = {
    parameter: {
      requestType: "routes",
      debug: "true"
    }
  };
  
  var response = doGet(mockRequest);
  Logger.log(response.getContent());
}

/**
 * ルート一覧をスプレッドシートから取得する関数
 * @return {Array} ルート名の配列
 */
function getRoutesList() {
  try {
    // スプレッドシートを開く
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // ルート一覧のシートを取得または作成
    let routeSheet = spreadsheet.getSheetByName('ルート一覧');
    
    // シートが存在しない場合は作成
    if (!routeSheet) {
      console.log('「ルート一覧」シートが見つからないため新規作成します');
      routeSheet = spreadsheet.insertSheet('ルート一覧');
      
      // デフォルトのルート一覧を設定
      const defaultRoutes = [
        "東京都心エリア", "東京西部エリア", "東京東部エリア", "東京北部エリア", 
        "東京南部エリア", "横浜中央エリア", "横浜北部エリア", "横浜南部エリア", 
        "川崎エリア", "埼玉中央エリア", "埼玉西部エリア", "埼玉東部エリア", 
        "千葉中央エリア", "千葉西部エリア"
      ];
      
      // ヘッダー行の追加
      routeSheet.appendRow(['ルート名', '備考']);
      
      // デフォルトルートの追加
      defaultRoutes.forEach(route => {
        routeSheet.appendRow([route, '']);
      });
      
      // シート装飾の設定
      routeSheet.getRange('A1:B1').setBackground('#efefef').setFontWeight('bold');
      routeSheet.setColumnWidth(1, 150);
      routeSheet.setColumnWidth(2, 250);
      routeSheet.setFrozenRows(1);
      
      console.log('デフォルトルートを設定しました');
    }
    
    // データ範囲の取得（ヘッダー行を除く）
    const lastRow = routeSheet.getLastRow();
    if (lastRow <= 1) {
      console.log('データが存在しません');
      return [];
    }
    
    const dataRange = routeSheet.getRange(2, 1, lastRow - 1, 1);
    const routeValues = dataRange.getValues();
    
    // 配列に変換（空の値を除く）
    const routes = routeValues
      .map(row => {
        const value = row[0];
        // 数値を文字列に変換
        return value === null || value === undefined ? '' : String(value);
      })
      .filter(route => route && route.trim().length > 0);
    
    console.log(`${routes.length}個のルートを取得しました:`, routes);
    
    // 空の場合はデフォルト値を返す
    if (routes.length === 0) {
      console.log('ルートが登録されていないため、デフォルト値を返します');
      return [
        "東京都心エリア", "東京西部エリア", "東京東部エリア", "東京北部エリア", 
        "東京南部エリア", "横浜中央エリア", "横浜北部エリア", "横浜南部エリア", 
        "川崎エリア", "埼玉中央エリア", "埼玉西部エリア", "埼玉東部エリア", 
        "千葉中央エリア", "千葉西部エリア"
      ];
    }
    
    return routes;
  } catch (error) {
    console.error('ルート一覧取得エラー:', error.message, error.stack);
    
    // エラーログをスプレッドシートに記録
    try {
      logData('ルート一覧取得エラー', {
        message: error.message,
        stack: error.stack
      });
    } catch (logError) {
      console.error('エラーログ記録失敗:', logError);
    }
    
    // エラー時はデフォルト値を返す
    return [
      "東京都心エリア", "東京西部エリア", "東京東部エリア", "東京北部エリア", 
      "東京南部エリア", "横浜中央エリア", "横浜北部エリア", "横浜南部エリア", 
      "川崎エリア", "埼玉中央エリア", "埼玉西部エリア", "埼玉東部エリア", 
      "千葉中央エリア", "千葉西部エリア"
    ];
  }
} 