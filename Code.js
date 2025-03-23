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
    // リクエストをログに記録
    console.log('GETリクエスト受信:', e && e.parameter ? JSON.stringify(e.parameter) : 'パラメータなし');
    
    // リクエストタイプの取得（パラメータがない場合はデフォルトで'routes'）
    const requestType = e && e.parameter && e.parameter.requestType 
                        ? e.parameter.requestType 
                        : 'routes';
    
    // リクエストタイプに応じた処理
    if (requestType === 'routes') {
      // ルート一覧を取得
      const routes = getRoutesList();
      console.log('取得したルート:', routes);
      
      const response = {
        status: 'ok',
        routes: routes
      };
      
      // ContentServiceを使用してJSONレスポンスを返す
      return createCorsJSONResponse(response);
    } else {
      // 不正なリクエストタイプの場合
      const errorResponse = {
        status: 'error',
        message: '不正なリクエストタイプです'
      };
      
      return createCorsJSONResponse(errorResponse);
    }
    
  } catch (error) {
    console.error('GETリクエスト処理エラー:', error);
    
    // エラーレスポンスの作成
    const errorResponse = {
      status: 'error',
      message: error.toString()
    };
    
    return createCorsJSONResponse(errorResponse);
  }
}

/**
 * HTTP POSTリクエスト処理関数
 */
function doPost(e) {
  try {
    // パラメータ取得
    const params = JSON.parse(e.postData.contents);
    console.log('POSTリクエスト受信:', JSON.stringify(params));
    
    // データシート取得
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("データ受信用");
    
    // データ追加
    sheet.appendRow([
      new Date(),           // タイムスタンプ
      params.route || "",   // ルート名
      params.latitude || "", // 緯度
      params.longitude || "", // 経度
      params.category || "", // カテゴリ
      params.comment || "",  // コメント
      params.imageUrl || "", // 画像URL
      params.address || "", // 住所
      params.material || "", // 資料配布状況
      params.progress || ""  // 工事進捗状況
    ]);
    
    // 成功レスポンスを返す
    const successResponse = {
      "result": "success"
    };
    
    return createCorsJSONResponse(successResponse);
    
  } catch (error) {
    console.error('POSTリクエスト処理エラー:', error);
    
    // エラーレスポンスを返す
    const errorResponse = {
      "result": "error",
      "message": error.toString()
    };
    
    return createCorsJSONResponse(errorResponse);
  }
}

/**
 * HTTP OPTIONSリクエスト処理関数（CORS対応用）
 */
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * CORS対応のJSONレスポンスを作成する共通関数
 */
function createCorsJSONResponse(data) {
  // JSONデータを文字列化
  const jsonString = JSON.stringify(data);
  
  // ContentServiceを使用してJSONレスポンスを返す
  // ContentServiceは最もシンプルなアプローチ
  const output = ContentService.createTextOutput(jsonString)
    .setMimeType(ContentService.MimeType.JSON);
    
  // CORSヘッダーはWebアプリのデプロイ設定で行う
  // GASのWebアプリは自動的にCORSを処理する
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