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
    
    // 画像がBase64形式で送信された場合はGoogleドライブに保存
    let imageUrl = params.imageUrl || "";
    if (params.imageData) {
      try {
        // Base64データから"data:image/jpeg;base64,"などのプレフィックスを取り除く
        const base64Data = params.imageData.split(',')[1] || params.imageData;
        // 一意のファイル名を生成（タイムスタンプ＋乱数）
        const fileName = `HOT_${new Date().getTime()}_${Math.floor(Math.random() * 1000)}.jpg`;
        // 画像をGoogleドライブに保存
        imageUrl = saveImageToFolder(base64Data, fileName);
        console.log('画像保存URL:', imageUrl);
      } catch (imageError) {
        console.error('画像保存エラー:', imageError);
      }
    }
    
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
      imageUrl,             // 画像URL（保存したURLを使用）
      params.address || "", // 住所
      params.material || "", // 資料配布状況
      params.progress || ""  // 工事進捗状況
    ]);
    
    // Chatworkに新規データ受信を通知
    const locationInfo = params.address || `${params.latitude}, ${params.longitude}`;
    const notificationMessage = `【新規HOT情報受信】\n` +
      `ルート: ${params.route || "未設定"}\n` + 
      `カテゴリ: ${params.category || "未設定"}\n` +
      `場所: ${locationInfo}\n` +
      `資料配布: ${params.material || "未設定"}\n` +
      `工事進捗: ${params.progress || "未設定"}\n` +
      `コメント: ${params.comment || "なし"}\n` +
      `受信日時: ${new Date().toLocaleString("ja-JP")}\n\n` +
      `確認はこちら: ${ss.getUrl()}`;
    
    // 通知を非同期で送信（APIリクエストの遅延でPWAの応答に影響しないように）
    try {
      sendChatworkNotification(notificationMessage);
    } catch (notifyError) {
      console.error("通知送信エラー（処理は続行）:", notifyError);
    }
    
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

/**
 * 画像をGoogleドライブに保存する関数
 * @param {string} base64Image - Base64エンコードされた画像データ
 * @param {string} fileName - 保存するファイル名
 * @return {string} 保存された画像の共有URL
 */
function saveImageToFolder(base64Image, fileName) {
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID);
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Image), 'image/jpeg', fileName);
    const file = folder.createFile(blob);
    
    // ファイルを共有設定（誰でも閲覧可能に）
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 共有可能なURL形式（手動で成功したのと同じ形式）
    return `https://drive.google.com/uc?export=view&id=${file.getId()}`;
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

/**
 * データ受信用シートから情報管理シートへデータを転記する関数
 * 列名を参照して転記するため、列の順序変更に強い設計
 */
function transferDataToManagementSheet() {
  try {
    console.log("転記処理を開始します");
    
    // スプレッドシートを取得
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const receiveSheet = ss.getSheetByName("データ受信用");
    const manageSheet = ss.getSheetByName("情報管理");
    
    if (!receiveSheet || !manageSheet) {
      console.error("シートが見つかりません");
      return;
    }
    
    // 受信シートのデータを取得
    const receiveData = getSheetDataAsObjects(receiveSheet);
    if (receiveData.length === 0) {
      console.log("転記するデータがありません");
      return;
    }
    
    console.log(`${receiveData.length}件のデータを処理します`);
    
    // 転記済みフラグ列を確認・作成
    const receiveCols = receiveSheet.getRange(1, 1, 1, receiveSheet.getLastColumn()).getValues()[0];
    let transferredFlagColIndex = receiveCols.indexOf("転記済みフラグ") + 1;
    
    // 転記済みフラグ列がなければ作成
    if (transferredFlagColIndex === 0) {
      receiveSheet.getRange(1, receiveSheet.getLastColumn() + 1).setValue("転記済みフラグ");
      transferredFlagColIndex = receiveSheet.getLastColumn();
      console.log("転記済みフラグ列を作成しました: " + transferredFlagColIndex);
    }
    
    // 転記する行のカウンター
    let transferredCount = 0;
    
    // 各行のデータを処理
    for (let i = 0; i < receiveData.length; i++) {
      const rowData = receiveData[i];
      
      // 既に転記済みならスキップ
      if (rowData["転記済みフラグ"] === true || rowData["転記済みフラグ"] === "TRUE") {
        continue;
      }
      
      // 情報管理シートへの転記データを準備
      const managementData = prepareManagementData(rowData);
      
      // 情報管理シートに行を追加
      appendRowToManagementSheet(manageSheet, managementData);
      
      // 転記済みフラグを設定
      const dataRowIndex = i + 2; // ヘッダー行 + 0から始まるインデックス
      receiveSheet.getRange(dataRowIndex, transferredFlagColIndex).setValue(true);
      
      transferredCount++;
    }
    
    console.log(`${transferredCount}件のデータを転記しました`);
    
    // シートの表示を調整
    if (transferredCount > 0) {
      manageSheet.autoResizeColumns(1, manageSheet.getLastColumn());
    }
    
    return transferredCount;
    
  } catch (error) {
    console.error("転記処理中にエラーが発生しました: " + error.toString());
    logData("転記エラー", error.toString());
    return 0;
  }
}

/**
 * シートのデータをオブジェクトの配列として取得する
 * ヘッダー行の値をキーとする
 */
function getSheetDataAsObjects(sheet) {
  try {
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    
    if (lastRow <= 1) return []; // ヘッダーのみの場合は空配列を返す
    
    // ヘッダー行を取得
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    // データ行を取得
    const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
    const dataValues = dataRange.getValues();
    
    // オブジェクトの配列に変換
    return dataValues.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        if (header) obj[header] = row[index];
      });
      return obj;
    });
  } catch (error) {
    console.error("データ取得エラー: " + error.toString());
    return [];
  }
}

/**
 * 受信データから情報管理シート用のデータを準備
 */
function prepareManagementData(rowData) {
  // 住所データと緯度経度の準備
  let locationInfo = rowData["住所"] || "";
  let locationFormula = "";
  let mapUrl = "";
  
  // 緯度・経度の有無を確認
  const hasCoordinates = rowData["緯度"] && rowData["経度"];
  
  // 緯度経度がある場合は、そのURLを優先（表示は住所またはデフォルト）
  if (hasCoordinates) {
    // リンク先は常に緯度経度ベースに
    mapUrl = `https://www.google.com/maps?q=${rowData["緯度"]},${rowData["経度"]}`;
    
    // 表示テキストは住所があればそれを使用、なければ緯度経度
    const displayText = locationInfo || `${rowData["緯度"]}, ${rowData["経度"]}`;
    locationFormula = `=HYPERLINK("${mapUrl}", "${displayText}")`;
  }
  // 住所だけの場合
  else if (locationInfo) {
    // 住所をURLエンコード
    const encodedAddress = encodeURIComponent(locationInfo);
    mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
    locationFormula = `=HYPERLINK("${mapUrl}", "${locationInfo}")`;
  }
  
  // 画像URLの取得（全角・半角の両方に対応）
  let imageUrl = null;
  if (rowData["画像URL"]) {
    imageUrl = rowData["画像URL"];
  } else if (rowData["画像ＵＲＬ"]) { // 全角URLをチェック
    imageUrl = rowData["画像ＵＲＬ"];
  }
  
  // 写真プレビュー用のIMAGE関数を作成
  let imageFormula = "";
  if (imageUrl) {
    // Google Drive URL形式の変換
    let viewUrl = imageUrl; // 表示用URL
    let originalUrl = imageUrl; // 原寸大表示用URL
    
    if (imageUrl.includes("/file/d/")) {
      // Google DriveのファイルURLを処理
      const fileIdMatch = imageUrl.match(/\/file\/d\/([^\/]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        const fileId = fileIdMatch[1];
        viewUrl = `https://drive.google.com/uc?export=view&id=${fileId}`; // サムネイル表示用
        originalUrl = `https://drive.google.com/file/d/${fileId}/view`; // 原寸大表示用
      }
    }
    
    // ハイパーリンク付き画像式（クリックで原寸大表示）
    imageFormula = `=HYPERLINK("${originalUrl}",IMAGE("${viewUrl}", 1))`;
    console.log("画像数式を生成: " + imageFormula);
  }
  
  // 日時のフォーマット（タイムスタンプがDateオブジェクトかどうかを確認）
  let dateValue = rowData["タイムスタンプ"];
  if (typeof dateValue === "string") {
    dateValue = new Date(dateValue);
  }
  
  // 新しいヘッダー順序に完全一致するオブジェクトを作成
  return {
    "データ取得日時": dateValue,
    "優先度": "",
    "ステータス": "未対応",
    "担当者": "",
    "対応メモ": "",
    "対応日": "",
    "ルート名": rowData["ルート名"] || "",
    "場所": locationFormula || locationInfo, // ハイパーリンク付きの場所情報または通常のテキスト
    "資料配布状況": rowData["資料配布状況"] || "",
    "工事進捗状況": rowData["工事進捗状況"] || "",
    "カテゴリ": rowData["カテゴリ"] || "",
    "コメント": rowData["コメント"] || "",
    "写真": imageFormula
  };
}

/**
 * 情報管理シートに行を追加
 * シートの列名を確認して適切な位置にデータを挿入
 */
function appendRowToManagementSheet(sheet, data) {
  try {
    // シートの列ヘッダーを取得
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const lastRow = sheet.getLastRow() + 1; // 新しい行の位置
    
    // 行単位で一度に値をセットする方法（appendRowを使わない）
    const rowData = [];
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      
      // 対応するデータがあれば挿入
      if (data[header] !== undefined) {
        rowData.push(data[header]);
      } else {
        rowData.push("");
      }
    }
    
    // まず通常の値を一括設定
    const newRange = sheet.getRange(lastRow, 1, 1, headers.length);
    newRange.setValues([rowData]);
    
    // 数式を個別に設定（写真と場所の列）
    for (let i = 0; i < headers.length; i++) {
      const cell = sheet.getRange(lastRow, i + 1);
      
      // 写真列の数式設定
      if (headers[i] === "写真" && data["写真"] && data["写真"].startsWith("=HYPERLINK")) {
        console.log(`行${lastRow}、列${i+1}に写真数式を設定: ${data["写真"]}`);
        cell.setFormula(data["写真"]);
      }
      
      // 場所列の数式設定
      if (headers[i] === "場所" && data["場所"] && data["場所"].startsWith("=HYPERLINK")) {
        console.log(`行${lastRow}、列${i+1}に場所数式を設定: ${data["場所"]}`);
        cell.setFormula(data["場所"]);
      }
    }
    
    return true;
  } catch (error) {
    console.error("行追加エラー: " + error.toString());
    return false;
  }
}

/**
 * 情報管理シートの初期設定を行う関数
 */
function setupManagementSheet() {
  try {
    console.log("情報管理シートの初期設定を開始します");
    
    // スプレッドシートを取得
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let manageSheet = ss.getSheetByName("情報管理");
    
    // シートが存在しない場合は作成
    if (!manageSheet) {
      manageSheet = ss.insertSheet("情報管理");
      console.log("情報管理シートを新規作成しました");
    }
    
    // ヘッダー行の設定（順序変更）
    const headers = [
      "データ取得日時", "優先度", "ステータス", "担当者", "対応メモ", "対応日", "ルート名", "場所", "資料配布状況", 
      "工事進捗状況", "カテゴリ", "コメント", "写真"
    ];
    
    // ヘッダーを設定
    const headerRange = manageSheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);
    
    // ヘッダーの書式設定
    headerRange.setBackground("#E0E0E0")
               .setFontWeight("bold")
               .setHorizontalAlignment("center");
    
    // 列幅の設定
    manageSheet.setColumnWidth(1, 150);  // データ取得日時
    manageSheet.setColumnWidth(2, 80);   // 優先度
    manageSheet.setColumnWidth(3, 100);  // ステータス
    manageSheet.setColumnWidth(4, 100);  // 担当者
    manageSheet.setColumnWidth(5, 300);  // 対応メモ
    manageSheet.setColumnWidth(6, 150);  // 対応日
    manageSheet.setColumnWidth(7, 150);  // ルート名
    manageSheet.setColumnWidth(8, 250);  // 場所
    manageSheet.setColumnWidth(9, 150);  // 資料配布状況
    manageSheet.setColumnWidth(10, 150); // 工事進捗状況
    manageSheet.setColumnWidth(11, 100); // カテゴリ
    manageSheet.setColumnWidth(12, 300); // コメント
    manageSheet.setColumnWidth(13, 150); // 写真
    
    // 優先度のデータ検証（ドロップダウンリスト）
    const priorityRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["高", "中", "低"], true)
      .build();
    manageSheet.getRange(2, 2, 1000, 1).setDataValidation(priorityRule);
    
    // ステータスのデータ検証（ドロップダウンリスト）
    const statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["未対応", "対応中", "成約", "不成約", "対象外"], true)
      .build();
    manageSheet.getRange(2, 3, 1000, 1).setDataValidation(statusRule);
    
    // 担当者のデータ検証（担当者一覧シートを参照するドロップダウンリスト）
    let staffListSheet = ss.getSheetByName("担当者一覧");
    
    // 担当者一覧シートが存在しない場合、エラーを表示して処理を続行
    if (!staffListSheet) {
      console.log("担当者一覧シートが見つかりません。担当者リストのドロップダウンは設定されません。");
      SpreadsheetApp.getUi().alert("担当者一覧シートが見つかりません。担当者リストのドロップダウンは設定されません。");
    } else {
      // 担当者一覧シートの有効な範囲を取得（A列の空白でないセル）
      const lastRow = staffListSheet.getLastRow();
      if (lastRow > 0) {
        // 担当者名の範囲を指定（A1からA最終行まで）
        const staffNameRange = staffListSheet.getRange(1, 1, lastRow, 1);
        
        // データ検証ルールを作成
        const staffRule = SpreadsheetApp.newDataValidation()
          .requireValueInRange(staffNameRange, true)
          .build();
        
        // 担当者列にデータ検証を適用
        manageSheet.getRange(2, 4, 1000, 1).setDataValidation(staffRule);
        console.log(`担当者リストのドロップダウンを設定しました（${lastRow}名）`);
      } else {
        console.log("担当者一覧シートにデータがありません");
      }
    }
    
    // フィルター機能の追加
    manageSheet.getRange(1, 1, 1, headers.length).createFilter();
    
    // ステータスに応じた条件付き書式設定
    // 「未対応」は赤背景
    const unprocessedRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("未対応")
      .setBackground("#FFCCCC")
      .setRanges([manageSheet.getRange(2, 3, 1000, 1)])
      .build();
      
    // 「対応中」は黄色背景
    const inProgressRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("対応中")
      .setBackground("#FFFFCC")
      .setRanges([manageSheet.getRange(2, 3, 1000, 1)])
      .build();
      
    // 「成約」は緑背景
    const contractedRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("成約")
      .setBackground("#CCFFCC")
      .setRanges([manageSheet.getRange(2, 3, 1000, 1)])
      .build();
      
    // 「不成約」は灰色背景
    const notContractedRule = SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("不成約")
      .setBackground("#EEEEEE")
      .setRanges([manageSheet.getRange(2, 3, 1000, 1)])
      .build();
      
    // 条件付き書式ルールを適用
    const rules = manageSheet.getConditionalFormatRules();
    rules.push(unprocessedRule, inProgressRule, contractedRule, notContractedRule);
    manageSheet.setConditionalFormatRules(rules);
    
    // 1行目を固定表示
    manageSheet.setFrozenRows(1);
    
    console.log("情報管理シートの初期設定が完了しました");
    return true;
    
  } catch (error) {
    console.error("情報管理シート設定エラー: " + error.toString());
    logData("シート設定エラー", error.toString());
    return false;
  }
}

/**
 * 自動転記トリガーを設定する関数
 */
function setupAutoTransferTrigger() {
  try {
    // 既存のトリガーを確認
    const triggers = ScriptApp.getProjectTriggers();
    let transferTriggerExists = false;
    
    // 転記用トリガーがすでに存在するか確認
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'transferDataToManagementSheet') {
        transferTriggerExists = true;
      }
    });
    
    // トリガーが存在しない場合のみ作成
    if (!transferTriggerExists) {
      // 1時間ごとに実行するトリガーを作成
      ScriptApp.newTrigger('transferDataToManagementSheet')
        .timeBased()
        .everyHours(1)
        .create();
      
      console.log("自動転記トリガーを設定しました（1時間ごと）");
      return "1時間ごとの自動転記を設定しました";
    } else {
      console.log("自動転記トリガーはすでに設定されています");
      return "自動転記トリガーはすでに設定されています";
    }
  } catch (error) {
    console.error("トリガー設定エラー: " + error.toString());
    return "エラーが発生しました: " + error.toString();
  }
}

/**
 * 自動転記トリガーを削除する関数
 */
function removeAutoTransferTrigger() {
  try {
    // 既存のトリガーを取得
    const triggers = ScriptApp.getProjectTriggers();
    let triggerRemoved = false;
    
    // 転記用トリガーを検索して削除
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'transferDataToManagementSheet') {
        ScriptApp.deleteTrigger(trigger);
        triggerRemoved = true;
      }
    });
    
    if (triggerRemoved) {
      console.log("自動転記トリガーを削除しました");
      return "自動転記トリガーを削除しました";
    } else {
      console.log("削除すべき自動転記トリガーはありませんでした");
      return "自動転記トリガーは設定されていません";
    }
  } catch (error) {
    console.error("トリガー削除エラー: " + error.toString());
    return "エラーが発生しました: " + error.toString();
  }
}

/**
 * Chatworkに通知を送信する関数
 * @param {string} message - 送信するメッセージ
 * @return {boolean} 送信成功時はtrue、失敗時はfalse
 */
function sendChatworkNotification(message) {
  try {
    // ※※※ 重要 ※※※
    // 以下の2つの値を実際のものに書き換えてください
    // Chatwork APIトークン（Chatworkの設定→APIから取得）
    const CHATWORK_API_TOKEN = "YOUR_CHATWORK_API_TOKEN"; // ←ここを変更
    
    // 通知先のチャットルームID（ルームのURLの末尾の数字）
    const ROOM_ID = "YOUR_CHATWORK_ROOM_ID"; // ←ここを変更
    
    // APIトークンが設定されていない場合はスキップ
    if (CHATWORK_API_TOKEN === "YOUR_CHATWORK_API_TOKEN") {
      console.log("Chatwork APIトークンが設定されていないため、通知はスキップされました");
      return false;
    }
    
    // APIリクエスト用の設定
    const url = `https://api.chatwork.com/v2/rooms/${ROOM_ID}/messages`;
    const options = {
      method: "post",
      headers: {
        "X-ChatWorkToken": CHATWORK_API_TOKEN
      },
      payload: {
        body: message
      }
    };
    
    // APIリクエスト実行
    const response = UrlFetchApp.fetch(url, options);
    console.log("Chatwork通知送信成功: " + response.getContentText());
    return true;
  } catch (error) {
    console.error("Chatwork通知送信エラー: " + error.toString());
    return false;
  }
}

/**
 * 転記機能をChatwork通知機能と連携
 * 転記完了後に転記件数をChatworkに通知
 */
function transferDataAndNotify() {
  try {
    // データ転記を実行
    const transferCount = transferDataToManagementSheet();
    
    // 転記結果に基づいて通知メッセージを作成
    if (transferCount > 0) {
      const message = `【HOT情報転記完了】\n` +
        `${transferCount}件の新規データを「情報管理」シートに転記しました。\n` +
        `日時: ${new Date().toLocaleString("ja-JP")}\n\n` +
        `確認はこちら: ${SpreadsheetApp.openById(SPREADSHEET_ID).getUrl()}`;
      
      // Chatworkに通知
      sendChatworkNotification(message);
    }
    
    return transferCount;
  } catch (error) {
    console.error("転記＆通知エラー: " + error.toString());
    return 0;
  }
}

/**
 * スプレッドシートを開いたときに実行される、メニュー設定
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    
    // カスタムメニュー作成（シンプル化）
    ui.createMenu('HOT情報管理')
      .addItem('ダッシュボードを更新', 'updateDashboardTrigger')
      .addItem('月次データを作成', 'createMonthlyReport')
      .addSeparator()
      .addItem('データ転送を手動実行', 'transferDataToManagementSheet')
      .addSeparator()
      .addItem('情報を検索', 'searchManagementSheet')
      .addSubMenu(ui.createMenu('⚙️ 管理機能')
        .addItem('情報管理シートの再初期化（注意）', 'setupManagementSheet')
        .addItem('転記機能の診断実行', 'diagnoseTranfer')
      )
      .addToUi();
    
    console.log('カスタムメニューが追加されました');
  } catch (error) {
    console.error('メニュー作成エラー: ' + error.toString());
    logDetailedError("onOpen", error);
  }
}

/**
 * 転記状況を確認する関数
 */
function checkTransferStatus() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const receiveSheet = ss.getSheetByName("データ受信用");
    
    if (!receiveSheet) {
      SpreadsheetApp.getUi().alert("データ受信用シートが見つかりません");
      return;
    }
    
    // シートのデータを取得
    const data = getSheetDataAsObjects(receiveSheet);
    
    // 転記済み・未転記のデータ数をカウント
    let transferredCount = 0;
    let pendingCount = 0;
    
    data.forEach(row => {
      if (row["転記済みフラグ"] === true || row["転記済みフラグ"] === "TRUE") {
        transferredCount++;
      } else {
        pendingCount++;
      }
    });
    
    // 結果を表示
    const ui = SpreadsheetApp.getUi();
    ui.alert(
      "転記状況",
      `総データ数: ${data.length}件\n` +
      `転記済み: ${transferredCount}件\n` +
      `未転記: ${pendingCount}件`,
      ui.ButtonSet.OK
    );
    
  } catch (error) {
    console.error("転記状況確認エラー: " + error.toString());
    SpreadsheetApp.getUi().alert("エラーが発生しました: " + error.toString());
  }
}

/**
 * 情報管理シートの検索機能を提供する関数
 */
function searchManagementSheet() {
  const ui = SpreadsheetApp.getUi();
  
  // 検索キーワードの入力ダイアログ
  const searchPrompt = ui.prompt(
    '情報検索',
    'キーワードを入力してください（ルート名、カテゴリ、コメントなど）:',
    ui.ButtonSet.OK_CANCEL
  );
  
  // キャンセルされた場合は処理中止
  if (searchPrompt.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  
  const keyword = searchPrompt.getResponseText().trim();
  if (keyword === '') {
    ui.alert('検索キーワードが入力されていません');
    return;
  }
  
  try {
    // スプレッドシートとシートの取得
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const manageSheet = ss.getSheetByName("情報管理");
    
    if (!manageSheet) {
      ui.alert('情報管理シートが見つかりません');
      return;
    }
    
    // シートのデータを取得
    const data = getSheetDataAsObjects(manageSheet);
    if (data.length === 0) {
      ui.alert('検索対象のデータがありません');
      return;
    }
    
    // キーワードで検索（大文字小文字を区別しない）
    const searchRegex = new RegExp(keyword, 'i');
    const results = data.filter(row => {
      return Object.values(row).some(value => {
        return value && String(value).match(searchRegex);
      });
    });
    
    // 検索結果の表示
    if (results.length === 0) {
      ui.alert('該当するデータが見つかりませんでした');
    } else {
      // 検索結果シートを準備（既存なら一旦削除）
      let resultSheet = ss.getSheetByName("検索結果");
      if (resultSheet) {
        ss.deleteSheet(resultSheet);
      }
      
      // 新しい検索結果シートを作成
      resultSheet = ss.insertSheet("検索結果");
      
      // ヘッダーを設定
      const headers = Object.keys(results[0]);
      resultSheet.appendRow(headers);
      
      // データを追加
      results.forEach(result => {
        const row = headers.map(header => result[header]);
        resultSheet.appendRow(row);
      });
      
      // シートの体裁を整える
      resultSheet.getRange(1, 1, 1, headers.length).setBackground("#E0E0E0").setFontWeight("bold");
      resultSheet.setFrozenRows(1);
      resultSheet.autoResizeColumns(1, headers.length);
      
      // 検索結果を表示
      ss.setActiveSheet(resultSheet);
      ui.alert(`「${keyword}」の検索結果: ${results.length}件見つかりました`);
    }
    
  } catch (error) {
    console.error("検索エラー: " + error.toString());
    ui.alert('検索中にエラーが発生しました: ' + error.toString());
  }
}

/**
 * 数式設定の診断用関数
 */
function testImageFormula() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("情報管理");
  
  if (!sheet) {
    console.error("情報管理シートが見つかりません");
    return;
  }
  
  // テスト用のURL（手動で動作確認できたもの）
  const viewImageUrl = "https://drive.google.com/uc?export=view&id=1p4NSiA_27rezPR3QeCJYHPuLvwkc3Ms4";
  const originalImageUrl = "https://drive.google.com/file/d/1p4NSiA_27rezPR3QeCJYHPuLvwkc3Ms4/view";
  
  // ハイパーリンク付き画像数式
  const imageFormula = `=HYPERLINK("${originalImageUrl}",IMAGE("${viewImageUrl}", 1))`;
  
  try {
    // 最終行の次の行を取得
    const lastRow = sheet.getLastRow() + 1;
    
    // 行を追加（データ取得日時とテスト表示）
    sheet.getRange(lastRow, 1).setValue(new Date());
    sheet.getRange(lastRow, 2).setValue("テスト");
    
    // 写真列を特定（ヘッダー行から検索）
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    let photoColumn = -1;
    
    for (let i = 0; i < headers.length; i++) {
      if (headers[i] === "写真") {
        photoColumn = i + 1; // 1ベースのインデックス
        break;
      }
    }
    
    if (photoColumn === -1) {
      console.error("「写真」列が見つかりません");
      return;
    }
    
    // 写真列に数式を直接設定
    console.log(`行${lastRow}、列${photoColumn}に数式を設定: ${imageFormula}`);
    const photoCell = sheet.getRange(lastRow, photoColumn);
    
    // 数式を設定
    photoCell.setFormula(imageFormula);
    
    // 設定後の値を確認
    console.log("数式設定後のセルの値:", photoCell.getFormula());
    
    return "テスト行を追加しました。スプレッドシートを確認してください。";
  } catch (error) {
    console.error("テスト中にエラーが発生しました:", error);
    return error.toString();
  }
}

/**
 * 転記処理の診断用関数
 */
function diagnoseTranfer() {
  try {
    // スプレッドシートを取得
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const receiveSheet = ss.getSheetByName("データ受信用");
    
    if (!receiveSheet) {
      console.error("データ受信用シートが見つかりません");
      return "データ受信用シートが見つかりません";
    }
    
    // 最新の1件のデータを取得
    const lastRow = receiveSheet.getLastRow();
    if (lastRow <= 1) {
      console.error("データが存在しません");
      return "データが存在しません";
    }
    
    // 最新行のデータを取得
    const headers = receiveSheet.getRange(1, 1, 1, receiveSheet.getLastColumn()).getValues()[0];
    const dataRow = receiveSheet.getRange(lastRow, 1, 1, receiveSheet.getLastColumn()).getValues()[0];
    
    // オブジェクトに変換
    const rowData = {};
    headers.forEach((header, index) => {
      if (header) rowData[header] = dataRow[index];
    });
    
    console.log("元データ:", JSON.stringify(rowData));
    
    // 画像URLの確認（全角・半角両方対応）
    let imageUrl = null;
    if (rowData["画像URL"]) {
      imageUrl = rowData["画像URL"];
      console.log("画像URL(半角):", imageUrl);
    } else if (rowData["画像ＵＲＬ"]) {
      imageUrl = rowData["画像ＵＲＬ"];
      console.log("画像URL(全角):", imageUrl);
    }
    
    if (!imageUrl) {
      console.log("画像URLが設定されていません");
      return "画像URLが設定されていません";
    }
    
    // Google Drive URL形式の変換
    let viewUrl = imageUrl;
    let originalUrl = imageUrl;
    
    if (imageUrl.includes("/file/d/")) {
      const fileIdMatch = imageUrl.match(/\/file\/d\/([^\/]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        const fileId = fileIdMatch[1];
        viewUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
        originalUrl = `https://drive.google.com/file/d/${fileId}/view`;
        console.log("変換された表示用URL:", viewUrl);
        console.log("変換された原寸大URL:", originalUrl);
      }
    }
    
    // 手動でハイパーリンク付き画像数式を作成
    const imageFormula = `=HYPERLINK("${originalUrl}",IMAGE("${viewUrl}", 1))`;
    console.log("生成されたハイパーリンク付き画像数式:", imageFormula);
    
    // prepareManagementDataで処理
    const managementData = prepareManagementData(rowData);
    console.log("変換後データ:", JSON.stringify(managementData));
    
    // 写真数式の確認
    console.log("写真数式(自動生成):", managementData["写真"]);
    
    // 情報管理シートに試験的に1行追加
    const manageSheet = ss.getSheetByName("情報管理");
    if (!manageSheet) {
      console.error("情報管理シートが見つかりません");
      return "情報管理シートが見つかりません";
    }
    
    // 通常の行追加方法
    const newRow = manageSheet.getLastRow() + 1;
    console.log(`新規行 ${newRow} に診断データを追加します`);
    
    // ヘッダーの取得
    const manageHeaders = manageSheet.getRange(1, 1, 1, manageSheet.getLastColumn()).getValues()[0];
    console.log("管理シートヘッダー:", manageHeaders);
    
    // 行データの準備
    const rowValues = [];
    for (let i = 0; i < manageHeaders.length; i++) {
      const header = manageHeaders[i];
      if (managementData[header] !== undefined) {
        rowValues.push(managementData[header]);
      } else {
        rowValues.push("");
      }
    }
    
    // 写真列のインデックスを特定
    let photoColIndex = -1;
    for (let i = 0; i < manageHeaders.length; i++) {
      if (manageHeaders[i] === "写真") {
        photoColIndex = i;
        break;
      }
    }
    
    if (photoColIndex === -1) {
      console.error("写真列が見つかりません");
      return "写真列が見つかりません";
    }
    
    console.log(`写真列は ${photoColIndex + 1} 列目です`);
    
    // 行を追加
    const range = manageSheet.getRange(newRow, 1, 1, manageHeaders.length);
    range.setValues([rowValues]);
    
    // 写真数式を個別に設定（手動生成した方）
    console.log(`写真数式を設定します: ${imageFormula}`);
    const photoCell = manageSheet.getRange(newRow, photoColIndex + 1);
    photoCell.setFormula(imageFormula);
    
    // 設定後の確認
    Utilities.sleep(500); // 少し待機
    const actualFormula = photoCell.getFormula();
    console.log(`設定後の数式: ${actualFormula}`);
    
    if (actualFormula !== imageFormula) {
      console.error("数式が正しく設定されていません！");
    }
    
    return "診断完了。ログを確認してください。テスト行が追加されました。";
  } catch (error) {
    console.error("診断中にエラーが発生しました:", error);
    return error.toString();
  }
}

/**
 * ダッシュボードシートを作成・更新する関数
 * 情報管理シートのデータを元に、サマリー情報を表示
 */
function createOrUpdateDashboard() {
  try {
    console.log("ダッシュボード更新を開始します");
    
    // スプレッドシートを取得
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const manageSheet = ss.getSheetByName("情報管理");
    
    if (!manageSheet) {
      throw new Error("情報管理シートが見つかりません");
    }
    
    // ダッシュボードシートを取得または作成
    let dashboardSheet = ss.getSheetByName("ダッシュボード");
    
    if (!dashboardSheet) {
      dashboardSheet = ss.insertSheet("ダッシュボード", 0); // 一番左に作成
      console.log("ダッシュボードシートを新規作成しました");
    } else {
      // 既存の場合はクリア
      dashboardSheet.clear();
      console.log("既存のダッシュボードシートをクリアしました");
    }
    
    // ダッシュボードのタイトル設定 - セル結合なし
    dashboardSheet.getRange("A1").setValue("HOT情報管理 ダッシュボード");
    dashboardSheet.getRange("A1:H1").setBackground("#4285f4").setFontColor("#ffffff").setFontWeight("bold")
      .setFontSize(14).setHorizontalAlignment("center");
    
    // 更新日時の表示 - セル結合なし
    const now = new Date();
    dashboardSheet.getRange("I1").setValue("最終更新: " + now.toLocaleString("ja-JP"));
    dashboardSheet.getRange("I1:K1").setBackground("#E0E0E0");
    
    // 情報管理シートからデータを取得
    const manageData = getSheetDataAsObjects(manageSheet);
    if (manageData.length === 0) {
      dashboardSheet.getRange("A3").setValue("データがありません");
      return true;
    }
    
    // データの状態をログ出力
    console.log(`${manageData.length}件のデータを取得しました`);
    console.log("最初の行のデータサンプル:", JSON.stringify(manageData[0]));
    
    try {
      // セクション1: 直近3ヶ月の集計
      createRecentSummary(dashboardSheet, manageData, 3);
      console.log("直近3ヶ月の集計を作成しました");
      
      // セクション2: ステータス別集計
      createStatusSummary(dashboardSheet, manageData);
      console.log("ステータス別集計を作成しました");
      
      // セクション3: 最新情報リスト（直近2週間）
      createRecentDataTable(dashboardSheet, manageData);
      console.log("最新情報リストを作成しました");
      
      // セクション4: ルート別集計
      createRouteSummary(dashboardSheet, manageData);
      console.log("ルート別集計を作成しました");
      
      // セクション5: 工事進捗状況別集計
      createProgressSummary(dashboardSheet, manageData);
      console.log("工事進捗状況別集計を作成しました");
    } catch (sectionError) {
      console.error("セクション作成中にエラーが発生しました: " + sectionError.toString());
      logDetailedError("createOrUpdateDashboard_section", sectionError);
      dashboardSheet.getRange("A3").setValue("一部セクションの更新中にエラーが発生しました: " + sectionError.toString());
      // エラーが発生しても処理を続行
    }
    
    // 列幅の調整
    dashboardSheet.setColumnWidth(1, 150);
    dashboardSheet.setColumnWidth(2, 150);
    dashboardSheet.setColumnWidth(3, 150);
    dashboardSheet.setColumnWidth(4, 150);
    dashboardSheet.setColumnWidth(5, 150);
    dashboardSheet.setColumnWidth(6, 150);
    dashboardSheet.setColumnWidth(7, 200);
    dashboardSheet.setColumnWidth(8, 150);
    dashboardSheet.setColumnWidth(9, 150);
    dashboardSheet.setColumnWidth(10, 150);
    dashboardSheet.setColumnWidth(11, 150);
    
    // 1行目を固定
    dashboardSheet.setFrozenRows(1);
    
    console.log("ダッシュボードの更新が完了しました");
    return true;
    
  } catch (error) {
    console.error("ダッシュボード更新エラー: " + error.toString());
    logDetailedError("createOrUpdateDashboard", error);
    return false;
  }
}

/**
 * 直近の集計情報を作成する関数
 * @param {Sheet} sheet - ダッシュボードシート
 * @param {Array} data - 情報管理シートのデータ
 * @param {Number} months - 集計する月数（デフォルト3ヶ月）
 */
function createRecentSummary(sheet, data, months = 3) {
  try {
    // セクションタイトル - 結合なし
    sheet.getRange("A3").setValue(`直近${months}ヶ月の集計情報`);
    sheet.getRange("A3:E3").setBackground("#E0E0E0").setFontWeight("bold");
    
    // 日付の範囲計算
    const now = new Date();
    const monthsAgo = new Date();
    monthsAgo.setMonth(now.getMonth() - months);
    
    // 直近データをフィルタリング
    const recentData = data.filter(row => {
      const dateValue = row["タイムスタンプ"] || row["データ取得日時"];
      if (!dateValue) return false;
      
      const rowDate = new Date(dateValue);
      return rowDate >= monthsAgo;
    });
    
    // 総件数
    sheet.getRange("A5").setValue("総件数:");
    sheet.getRange("B5").setValue(recentData.length);
    
    // ステータス別集計
    sheet.getRange("A6").setValue("ステータス別:");
    
    // ステータスの件数をカウント
    const statusCounts = {};
    recentData.forEach(row => {
      const status = row["ステータス"] || row["対応ステータス"] || "不明";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    // ステータス表示の順序を設定
    const statusOrder = ["未対応", "対応中", "成約", "対象外", "不成約", "不明"];
    
    // 指定された順序でステータスを表示
    let rowIndex = 7;
    for (const status of statusOrder) {
      if (statusCounts[status]) {
        sheet.getRange(rowIndex, 1).setValue(status);
        sheet.getRange(rowIndex, 2).setValue(statusCounts[status]);
        
        // ステータスに応じた背景色設定
        if (status === "未対応") {
          sheet.getRange(rowIndex, 1).setBackground("#FFCCCC");
        } else if (status === "対応中") {
          sheet.getRange(rowIndex, 1).setBackground("#FFFFCC");
        } else if (status === "成約") {
          sheet.getRange(rowIndex, 1).setBackground("#CCFFCC");
        }
        
        rowIndex++;
      }
    }
    
    // その他のステータスを表示（指定された順序以外のもの）
    for (const [status, count] of Object.entries(statusCounts)) {
      if (!statusOrder.includes(status)) {
        sheet.getRange(rowIndex, 1).setValue(status);
        sheet.getRange(rowIndex, 2).setValue(count);
        rowIndex++;
      }
    }
    
    // 月別件数
    sheet.getRange("A" + (rowIndex + 1)).setValue("月別件数:");
    rowIndex += 2;
    
    // 月ごとのデータをカウント
    const monthCounts = {};
    recentData.forEach(row => {
      const dateValue = row["タイムスタンプ"] || row["データ取得日時"];
      if (dateValue) {
        const rowDate = new Date(dateValue);
        const yearMonth = Utilities.formatDate(rowDate, "JST", "yyyy-MM");
        monthCounts[yearMonth] = (monthCounts[yearMonth] || 0) + 1;
      }
    });
    
    // 日付順（降順）で月別データを表示
    const sortedMonths = Object.keys(monthCounts).sort().reverse();
    for (const yearMonth of sortedMonths) {
      sheet.getRange(rowIndex, 1).setValue(yearMonth);
      sheet.getRange(rowIndex, 2).setValue(monthCounts[yearMonth]);
      rowIndex++;
    }
  } catch (error) {
    console.error("直近集計作成エラー: " + error.toString());
    logDetailedError("createRecentSummary", error);
  }
}

/**
 * ステータス別の集計情報を作成する関数
 * @param {Sheet} sheet - ダッシュボードシート
 * @param {Array} data - 情報管理シートのデータ
 */
function createStatusSummary(sheet, data) {
  try {
    // セクションタイトル - 結合なし
    sheet.getRange("F3").setValue("ステータス別詳細");
    sheet.getRange("F3:K3").setBackground("#E0E0E0").setFontWeight("bold");
    
    // 日付の範囲計算
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    
    // 直近3ヶ月のデータをフィルタリング
    const recentData = data.filter(row => {
      const dateValue = row["タイムスタンプ"] || row["データ取得日時"];
      if (!dateValue) return false;
      
      const rowDate = new Date(dateValue);
      return rowDate >= threeMonthsAgo;
    });
    
    // 表のヘッダー
    sheet.getRange("F5").setValue("ステータス");
    sheet.getRange("G5").setValue("総件数");
    sheet.getRange("H5").setValue("カテゴリ別内訳");
    sheet.getRange("I5").setValue("最近の更新");
    
    // ヘッダーの書式設定
    sheet.getRange("F5:I5").setBackground("#f3f3f3").setFontWeight("bold");
    
    // ステータスの件数とカテゴリをカウント
    const statusData = {};
    const statusLastUpdate = {};
    
    recentData.forEach(row => {
      const status = row["ステータス"] || row["対応ステータス"] || "不明";
      const category = row["カテゴリ"] || "未設定";
      const dateValue = row["タイムスタンプ"] || row["データ取得日時"];
      
      // ステータスのデータを初期化（なければ）
      if (!statusData[status]) {
        statusData[status] = {
          count: 0,
          categories: {}
        };
      }
      
      // カウント増加
      statusData[status].count++;
      statusData[status].categories[category] = (statusData[status].categories[category] || 0) + 1;
      
      // 最新の更新日を記録
      if (dateValue) {
        const updateDate = new Date(dateValue);
        if (!statusLastUpdate[status] || updateDate > statusLastUpdate[status]) {
          statusLastUpdate[status] = updateDate;
        }
      }
    });
    
    // ステータス表示の順序を設定
    const statusOrder = ["未対応", "対応中", "成約", "対象外", "不成約"];
    
    // 指定された順序でステータスを表示
    let rowIndex = 6;
    
    // 主要なステータスを優先表示
    for (const status of statusOrder) {
      if (statusData[status]) {
        displayStatusRow(sheet, rowIndex, status, statusData[status], statusLastUpdate[status]);
        rowIndex++;
        delete statusData[status]; // 表示済みは削除
      }
    }
    
    // その他のステータスを表示
    for (const [status, data] of Object.entries(statusData)) {
      displayStatusRow(sheet, rowIndex, status, data, statusLastUpdate[status]);
      rowIndex++;
    }
    
    // 表の枠線設定
    sheet.getRange("F5:I" + (rowIndex - 1)).setBorder(true, true, true, true, true, true);
  } catch (error) {
    console.error("ステータス別詳細作成エラー: " + error.toString());
    logDetailedError("createStatusSummary", error);
    sheet.getRange("F5").setValue("エラーが発生しました: " + error.toString());
  }
}

/**
 * 最新情報リストを作成する関数
 * @param {Sheet} sheet - ダッシュボードシート
 * @param {Array} data - 情報管理シートのデータ
 */
function createRecentDataTable(sheet, data) {
  try {
    // セクションタイトル - 結合なし
    const startRow = 20;
    sheet.getRange(startRow, 1).setValue("最新情報リスト（直近2週間）");
    sheet.getRange(startRow, 1, 1, 10).setBackground("#E0E0E0").setFontWeight("bold");
    
    // 日付の範囲計算
    const now = new Date();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(now.getDate() - 14);
    
    // 直近データをフィルタリング
    const recentData = data.filter(row => {
      // タイムスタンプかデータ取得日時のどちらか存在する方を使用
      const dateValue = row["タイムスタンプ"] || row["データ取得日時"];
      if (!dateValue) return false;
      
      const rowDate = new Date(dateValue);
      return rowDate >= twoWeeksAgo;
    }).sort((a, b) => {
      // 日付の新しい順にソート
      const dateA = new Date(a["タイムスタンプ"] || a["データ取得日時"]);
      const dateB = new Date(b["タイムスタンプ"] || b["データ取得日時"]);
      return dateB - dateA;
    });
    
    // 表のヘッダー
    const headers = ["取得日時", "ステータス", "ルート", "カテゴリ", "資料配布状況", "工事進捗状況", "場所", "コメント"];
    
    // ヘッダーの設定
    for (let i = 0; i < headers.length; i++) {
      sheet.getRange(startRow + 2, i + 1).setValue(headers[i]);
    }
    
    // ヘッダーの書式設定
    sheet.getRange(startRow + 2, 1, 1, headers.length).setBackground("#f3f3f3").setFontWeight("bold");
    
    // データがない場合
    if (recentData.length === 0) {
      sheet.getRange(startRow + 3, 1).setValue("表示するデータがありません");
      // 他のセルは空白にしておく
      return;
    }
    
    // データの表示（最大20件まで）
    const displayCount = Math.min(recentData.length, 20);
    
    for (let i = 0; i < displayCount; i++) {
      const row = recentData[i];
      
      try {
        // 日付フォーマット
        const dateValue = row["タイムスタンプ"] || row["データ取得日時"];
        const date = new Date(dateValue);
        const formattedDate = Utilities.formatDate(date, "JST", "yyyy/MM/dd HH:mm");
        
        // データを設定
        sheet.getRange(startRow + 3 + i, 1).setValue(formattedDate);
        sheet.getRange(startRow + 3 + i, 2).setValue(row["ステータス"] || row["対応ステータス"] || "");
        sheet.getRange(startRow + 3 + i, 3).setValue(row["ルート名"] || row["ルート"] || "");
        sheet.getRange(startRow + 3 + i, 4).setValue(row["カテゴリ"] || "");
        sheet.getRange(startRow + 3 + i, 5).setValue(row["資料配布状況"] || "");
        sheet.getRange(startRow + 3 + i, 6).setValue(row["工事進捗状況"] || "");
        
        // 場所の処理（HYPERLINK関数対応）
        const locationValue = row["場所"] || row["住所"];
        if (locationValue) {
          // HYPERLINKかどうかに関わらず、テキストとして表示する
          sheet.getRange(startRow + 3 + i, 7).setValue(locationValue.toString().replace(/=HYPERLINK\("[^"]+",\s*"([^"]+)"\)/i, "$1"));
        } else {
          sheet.getRange(startRow + 3 + i, 7).setValue("");
        }
        
        sheet.getRange(startRow + 3 + i, 8).setValue(row["コメント"] || "");
        
        // ステータスに応じた背景色設定
        const status = row["ステータス"] || row["対応ステータス"] || "";
        if (status === "未対応") {
          sheet.getRange(startRow + 3 + i, 2).setBackground("#FFCCCC");
        } else if (status === "対応中") {
          sheet.getRange(startRow + 3 + i, 2).setBackground("#FFFFCC");
        } else if (status === "成約") {
          sheet.getRange(startRow + 3 + i, 2).setBackground("#CCFFCC");
        }
      } catch (error) {
        console.error(`データ表示エラー(行 ${i+1}): ${error.toString()}`);
        // エラーが発生しても処理を続行
        sheet.getRange(startRow + 3 + i, 1).setValue("エラー");
        sheet.getRange(startRow + 3 + i, 2).setValue(error.toString());
      }
    }
    
    // 表の枠線設定
    sheet.getRange(startRow + 2, 1, displayCount + 1, headers.length).setBorder(true, true, true, true, true, true);
  } catch (error) {
    console.error("最新情報リスト作成エラー: " + error.toString());
    logDetailedError("createRecentDataTable", error);
  }
}

/**
 * ルート別集計を作成する関数
 * @param {Sheet} sheet - ダッシュボードシート
 * @param {Array} data - 情報管理シートのデータ
 */
function createRouteSummary(sheet, data) {
  try {
    // セクションタイトル - 結合なし
    const startRow = 20;
    const startCol = 10;
    sheet.getRange(startRow, startCol).setValue("ルート別集計");
    sheet.getRange(startRow, startCol, 1, 3).setBackground("#E0E0E0").setFontWeight("bold");
    
    // 日付の範囲計算
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    
    // 直近3ヶ月のデータをフィルタリング
    const recentData = data.filter(row => {
      const dateValue = row["タイムスタンプ"] || row["データ取得日時"];
      if (!dateValue) return false;
      
      const rowDate = new Date(dateValue);
      return rowDate >= threeMonthsAgo;
    });
    
    // ルート別にカウント
    const routeCounts = {};
    recentData.forEach(row => {
      const route = row["ルート名"] || row["ルート"] || "未設定";
      routeCounts[route] = (routeCounts[route] || 0) + 1;
    });
    
    // 表のヘッダー
    sheet.getRange(startRow + 2, startCol).setValue("ルート名");
    sheet.getRange(startRow + 2, startCol + 1).setValue("件数");
    
    // ヘッダーの書式設定
    sheet.getRange(startRow + 2, startCol, 1, 2).setBackground("#f3f3f3").setFontWeight("bold");
    
    // データの表示
    let rowOffset = 3;
    
    // 件数の多い順にソート
    const sortedRoutes = Object.entries(routeCounts)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0]);
    
    for (const route of sortedRoutes) {
      const count = routeCounts[route];
      
      sheet.getRange(startRow + rowOffset, startCol).setValue(route);
      sheet.getRange(startRow + rowOffset, startCol + 1).setValue(count);
      
      rowOffset++;
      
      // 最大10件まで表示
      if (rowOffset > 12) break;
    }
    
    // 表の枠線設定
    sheet.getRange(startRow + 2, startCol, rowOffset - 2, 2).setBorder(true, true, true, true, true, true);
  } catch (error) {
    console.error("ルート別集計作成エラー: " + error.toString());
    logDetailedError("createRouteSummary", error);
  }
}

/**
 * 工事進捗状況別集計を作成する関数
 * @param {Sheet} sheet - ダッシュボードシート
 * @param {Array} data - 情報管理シートのデータ
 */
function createProgressSummary(sheet, data) {
  try {
    // セクションタイトル - 結合なし
    const startRow = 45;
    sheet.getRange(startRow, 1).setValue("工事進捗状況別集計");
    sheet.getRange(startRow, 1, 1, 5).setBackground("#E0E0E0").setFontWeight("bold");
    
    // 日付の範囲計算
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    
    // 直近3ヶ月のデータをフィルタリング
    const recentData = data.filter(row => {
      const dateValue = row["タイムスタンプ"] || row["データ取得日時"];
      if (!dateValue) return false;
      
      const rowDate = new Date(dateValue);
      return rowDate >= threeMonthsAgo;
    });
    
    // 工事進捗状況別にカウント
    const progressCounts = {};
    recentData.forEach(row => {
      const progress = row["工事進捗状況"] || "未設定";
      progressCounts[progress] = (progressCounts[progress] || 0) + 1;
    });
    
    // 表のヘッダー
    sheet.getRange(startRow + 2, 1).setValue("工事進捗状況");
    sheet.getRange(startRow + 2, 2).setValue("件数");
    sheet.getRange(startRow + 2, 3).setValue("未対応件数");
    sheet.getRange(startRow + 2, 4).setValue("対応中件数");
    sheet.getRange(startRow + 2, 5).setValue("成約件数");
    
    // ヘッダーの書式設定
    sheet.getRange(startRow + 2, 1, 1, 5).setBackground("#f3f3f3").setFontWeight("bold");
    
    // データの表示
    let rowOffset = 3;
    
    // 主要な工事進捗状況（優先表示）
    const keyProgress = [
      "内装工事中（初期段階）",
      "内装工事中（近日終了？）",
      "外装完了",
      "オープン間近",
      "解体中"
    ];
    
    // まず主要な進捗状況を表示
    for (const progress of keyProgress) {
      if (progressCounts[progress]) {
        displayProgressRow(sheet, startRow + rowOffset, progress, progressCounts[progress], recentData);
        rowOffset++;
        delete progressCounts[progress]; // 表示済みは削除
      }
    }
    
    // その他の進捗状況を表示
    for (const [progress, count] of Object.entries(progressCounts)) {
      if (progress !== "未設定") {
        displayProgressRow(sheet, startRow + rowOffset, progress, count, recentData);
        rowOffset++;
      }
    }
    
    // 未設定も表示
    if (progressCounts["未設定"]) {
      displayProgressRow(sheet, startRow + rowOffset, "未設定", progressCounts["未設定"], recentData);
      rowOffset++;
    }
    
    // 表の枠線設定
    sheet.getRange(startRow + 2, 1, rowOffset - 2, 5).setBorder(true, true, true, true, true, true);
  } catch (error) {
    console.error("工事進捗状況集計エラー: " + error.toString());
    logDetailedError("createProgressSummary", error);
    sheet.getRange(startRow + 2, 1).setValue("エラーが発生しました: " + error.toString());
  }
}

/**
 * 工事進捗状況の詳細行を表示する関数
 * @param {Sheet} sheet - ダッシュボードシート
 * @param {Number} row - 表示する行番号
 * @param {String} progress - 工事進捗状況
 * @param {Number} count - 総件数
 * @param {Array} data - 集計対象データ
 */
function displayProgressRow(sheet, row, progress, count, data) {
  try {
    // 基本情報を設定
    sheet.getRange(row, 1).setValue(progress);
    sheet.getRange(row, 2).setValue(count);
    
    // ステータス別にフィルタリングしてカウント
    const unprocessedCount = data.filter(item => 
      (item["工事進捗状況"] || "") === progress && 
      (item["ステータス"] || item["対応ステータス"] || "") === "未対応"
    ).length;
    
    const inProgressCount = data.filter(item => 
      (item["工事進捗状況"] || "") === progress && 
      (item["ステータス"] || item["対応ステータス"] || "") === "対応中"
    ).length;
    
    const contractedCount = data.filter(item => 
      (item["工事進捗状況"] || "") === progress && 
      (item["ステータス"] || item["対応ステータス"] || "") === "成約"
    ).length;
    
    // ステータス別の件数を設定
    sheet.getRange(row, 3).setValue(unprocessedCount);
    sheet.getRange(row, 4).setValue(inProgressCount);
    sheet.getRange(row, 5).setValue(contractedCount);
    
    // オープン間近は強調表示
    if (progress === "オープン間近") {
      sheet.getRange(row, 1, 1, 5).setBackground("#ffff99");
    }
  } catch (error) {
    console.error(`進捗行表示エラー(${progress}): ${error.toString()}`);
    sheet.getRange(row, 1).setValue(progress);
    sheet.getRange(row, 2).setValue("エラー");
  }
}

/**
 * ダッシュボード更新トリガー
 * メニューアクションからダッシュボードを手動更新するための関数
 */
function updateDashboardTrigger() {
  try {
    const result = createOrUpdateDashboard();
    const ui = SpreadsheetApp.getUi();
    
    if (result) {
      ui.alert('ダッシュボード更新', 'ダッシュボードが正常に更新されました。', ui.ButtonSet.OK);
    } else {
      ui.alert('ダッシュボード更新エラー', 
               'ダッシュボードの更新中にエラーが発生しました。\n詳細はログを確認してください。', 
               ui.ButtonSet.OK);
    }
  } catch (error) {
    console.error('ダッシュボード更新実行エラー: ' + error.toString());
    logDetailedError("updateDashboardTrigger", error);
    
    const ui = SpreadsheetApp.getUi();
    ui.alert('エラー', 
             '処理中に予期しないエラーが発生しました: ' + error.toString(), 
             ui.ButtonSet.OK);
  }
}

/**
 * 毎日のダッシュボード自動更新トリガーを設定する関数
 */
function setupDailyDashboardUpdate() {
  try {
    // 既存のトリガーを確認
    const triggers = ScriptApp.getProjectTriggers();
    let dashboardTriggerExists = false;
    
    // ダッシュボード更新トリガーがすでに存在するか確認
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'createOrUpdateDashboard') {
        dashboardTriggerExists = true;
      }
    });
    
    // トリガーが存在しない場合のみ作成
    if (!dashboardTriggerExists) {
      // 毎日午前6時に実行するトリガーを作成
      ScriptApp.newTrigger('createOrUpdateDashboard')
        .timeBased()
        .everyDays(1)
        .atHour(6)
        .create();
      
      console.log("ダッシュボード自動更新トリガーを設定しました（毎日午前6時）");
      return "毎日午前6時のダッシュボード自動更新を設定しました";
    } else {
      console.log("ダッシュボード自動更新トリガーはすでに設定されています");
      return "ダッシュボード自動更新トリガーはすでに設定されています";
    }
  } catch (error) {
    console.error("トリガー設定エラー: " + error.toString());
    return "エラーが発生しました: " + error.toString();
  }
}

/**
 * ダッシュボード自動更新トリガーを削除する関数
 */
function removeDashboardUpdateTrigger() {
  try {
    // 既存のトリガーを取得
    const triggers = ScriptApp.getProjectTriggers();
    let triggerRemoved = false;
    
    // ダッシュボード更新トリガーを検索して削除
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'createOrUpdateDashboard') {
        ScriptApp.deleteTrigger(trigger);
        triggerRemoved = true;
      }
    });
    
    if (triggerRemoved) {
      console.log("ダッシュボード自動更新トリガーを削除しました");
      return "ダッシュボード自動更新トリガーを削除しました";
    } else {
      console.log("削除すべきダッシュボード自動更新トリガーはありませんでした");
      return "ダッシュボード自動更新トリガーは設定されていません";
    }
  } catch (error) {
    console.error("トリガー削除エラー: " + error.toString());
    return "エラーが発生しました: " + error.toString();
  }
}

/**
 * 月次集計シートを作成する関数
 * 毎月の情報を集計して別シートに保存し、データ管理を容易にする
 */
function createMonthlyReport() {
  try {
    console.log("月次レポート作成を開始します");
    
    // スプレッドシートを取得
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const manageSheet = ss.getSheetByName("情報管理");
    
    if (!manageSheet) {
      throw new Error("情報管理シートが見つかりません");
    }
    
    // 情報管理シートからデータを取得
    const manageData = getSheetDataAsObjects(manageSheet);
    if (manageData.length === 0) {
      console.log("データがありません");
      SpreadsheetApp.getUi().alert("データがありません。情報管理シートにデータを追加してください。");
      return true;
    }
    
    // 現在の年月を取得
    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const yearMonth = Utilities.formatDate(lastMonth, "JST", "yyyy-MM");
    const yearMonthDisplay = Utilities.formatDate(lastMonth, "JST", "yyyy年MM月");
    
    // 月次レポートシート名
    const sheetName = "月次集計";
    
    // 既存のシートを確認
    let monthlySheet = ss.getSheetByName(sheetName);
    
    if (!monthlySheet) {
      // 新規シートを作成
      monthlySheet = ss.insertSheet(sheetName);
      setupMonthlyReportSheet(monthlySheet);
      console.log(`${sheetName}シートを新規作成しました`);
    }
    
    // 指定年月のデータをフィルタリング
    const monthlyData = manageData.filter(row => {
      const dateValue = row["タイムスタンプ"] || row["データ取得日時"];
      if (!dateValue) return false;
      
      const rowDate = new Date(dateValue);
      const rowYearMonth = Utilities.formatDate(rowDate, "JST", "yyyy-MM");
      return rowYearMonth === yearMonth;
    });
    
    // データがない場合
    if (monthlyData.length === 0) {
      const ui = SpreadsheetApp.getUi();
      ui.alert(`${yearMonthDisplay}のデータはありません`, 
               `${yearMonthDisplay}に該当するデータが見つかりませんでした。`, 
               ui.ButtonSet.OK);
      return true;
    }
    
    // 既存データの確認
    const lastRow = monthlySheet.getLastRow();
    const dataRange = monthlySheet.getRange(2, 1, Math.max(1, lastRow - 1), 1).getValues();
    
    // すでに同じ月のデータがあるか確認
    let existingRow = -1;
    for (let i = 0; i < dataRange.length; i++) {
      if (dataRange[i][0] === yearMonthDisplay) {
        existingRow = i + 2; // ヘッダー行(1行目)の次から始まるため+2
        break;
      }
    }
    
    // ステータス別件数集計
    const statusCounts = {
      "未対応": 0,
      "対応中": 0,
      "成約": 0,
      "不成約": 0,
      "対象外": 0
    };
    
    monthlyData.forEach(row => {
      const status = row["ステータス"] || row["対応ステータス"] || "";
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status]++;
      }
    });
    
    // ルート別集計
    const routeCounts = {};
    monthlyData.forEach(row => {
      const route = row["ルート名"] || row["ルート"] || "未設定";
      routeCounts[route] = (routeCounts[route] || 0) + 1;
    });
    
    // 上位3つのルートを取得（表示用）
    const topRoutes = Object.entries(routeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([route, count]) => `${route}: ${count}件`)
      .join(", ");
    
    // ルート別のすべての情報をJSON形式で保存
    const routeDetailJson = JSON.stringify(
      Object.entries(routeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([route, count]) => ({
          route: route,
          count: count,
          percent: Math.round((count / monthlyData.length) * 100) + "%"
        }))
    );
    
    // カテゴリ別集計
    const categoryCounts = {};
    monthlyData.forEach(row => {
      const category = row["カテゴリ"] || "未設定";
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    
    // 上位3つのカテゴリを取得
    const topCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, count]) => `${category}: ${count}件`)
      .join(", ");
    
    // データ行を作成
    const dataRow = [
      yearMonthDisplay,                         // 年月
      monthlyData.length,                       // 総件数
      statusCounts["未対応"],                    // 未対応
      statusCounts["対応中"],                    // 対応中
      statusCounts["成約"],                      // 成約
      statusCounts["不成約"],                    // 不成約
      statusCounts["対象外"],                    // 対象外
      topRoutes,                                // ルート別上位（表示用）
      routeDetailJson,                          // ルート別全データ（JSON形式）
      topCategories,                            // カテゴリ別上位
      new Date()                                // 作成日時
    ];
    
    // 更新または新規追加
    if (existingRow > 0) {
      // 既存行を更新
      monthlySheet.getRange(existingRow, 1, 1, dataRow.length).setValues([dataRow]);
      console.log(`${yearMonthDisplay}のデータを更新しました`);
    } else {
      // 新規行を追加
      monthlySheet.appendRow(dataRow);
      console.log(`${yearMonthDisplay}のデータを追加しました`);
    }
    
    // 行ごとの色分け
    const rowsCount = monthlySheet.getLastRow();
    for (let i = 2; i <= rowsCount; i++) {
      const rowColor = i % 2 === 0 ? "#f8f8f8" : "#ffffff";
      monthlySheet.getRange(i, 1, 1, dataRow.length).setBackground(rowColor);
    }
    
    // 完了メッセージ
    const ui = SpreadsheetApp.getUi();
    ui.alert("月次データ集計完了", 
             `${yearMonthDisplay}のデータ（${monthlyData.length}件）を月次集計シートに${existingRow > 0 ? "更新" : "追加"}しました。`, 
             ui.ButtonSet.OK);
    
    return true;
    
  } catch (error) {
    console.error("月次レポート作成エラー: " + error.toString());
    logDetailedError("createMonthlyReport", error);
    
    const ui = SpreadsheetApp.getUi();
    ui.alert("エラー", 
             "月次レポート作成中にエラーが発生しました: " + error.toString(), 
             ui.ButtonSet.OK);
    
    return false;
  }
}

/**
 * 月次レポートシートの初期設定
 */
function setupMonthlyReportSheet(sheet) {
  try {
    // タイトル設定
    const headers = [
      "年月", "総件数", "未対応", "対応中", "成約", "不成約", "対象外", 
      "ルート別TOP3", "ルートデータ(JSON)", "カテゴリ別TOP3", "作成日時"
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#E0E0E0").setFontWeight("bold");
    
    // 列幅調整
    sheet.setColumnWidth(1, 100);   // 年月
    sheet.setColumnWidth(2, 70);    // 総件数
    sheet.setColumnWidth(3, 70);    // 未対応
    sheet.setColumnWidth(4, 70);    // 対応中
    sheet.setColumnWidth(5, 70);    // 成約
    sheet.setColumnWidth(6, 70);    // 不成約
    sheet.setColumnWidth(7, 70);    // 対象外
    sheet.setColumnWidth(8, 200);   // ルート別TOP3
    sheet.setColumnWidth(9, 300);   // ルートデータ(JSON)
    sheet.setColumnWidth(10, 200);  // カテゴリ別TOP3
    sheet.setColumnWidth(11, 150);  // 作成日時
    
    // JSONデータ列のメモを追加
    sheet.getRange(1, 9).setNote("このセルにはすべてのルート情報がJSON形式で保存されています。\n" +
                                "データ分析が必要な場合は、このJSONデータを使用してください。\n" +
                                "形式: [{route:'ルート名',count:件数,percent:'割合%'},...]");
    
    // 1行目を固定
    sheet.setFrozenRows(1);
    
    console.log("月次レポートシートの初期設定が完了しました");
  } catch (error) {
    console.error("月次レポートシート初期設定エラー: " + error.toString());
    logDetailedError("setupMonthlyReportSheet", error);
  }
}

/**
 * 月次集計トリガーを設定する関数
 * 毎月1日に自動実行
 */
function setupMonthlyReportTrigger() {
  try {
    // 既存のトリガーを確認
    const triggers = ScriptApp.getProjectTriggers();
    let monthlyReportTriggerExists = false;
    
    // 月次集計トリガーがすでに存在するか確認
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'createMonthlyReport') {
        monthlyReportTriggerExists = true;
      }
    });
    
    // トリガーが存在しない場合のみ作成
    if (!monthlyReportTriggerExists) {
      // 毎月1日午前9時に実行するトリガーを作成
      ScriptApp.newTrigger('createMonthlyReport')
        .timeBased()
        .onMonthDay(1)
        .atHour(9)
        .create();
      
      console.log("月次集計トリガーを設定しました（毎月1日午前9時）");
      SpreadsheetApp.getUi().alert("月次集計トリガーを設定しました（毎月1日午前9時）");
      return "月次集計トリガーを設定しました";
    } else {
      console.log("月次集計トリガーはすでに設定されています");
      SpreadsheetApp.getUi().alert("月次集計トリガーはすでに設定されています");
      return "月次集計トリガーはすでに設定されています";
    }
  } catch (error) {
    console.error("トリガー設定エラー: " + error.toString());
    SpreadsheetApp.getUi().alert("エラーが発生しました: " + error.toString());
    return "エラーが発生しました: " + error.toString();
  }
}

/**
 * 月次集計トリガーを削除する関数
 */
function removeMonthlyReportTrigger() {
  try {
    // 既存のトリガーを取得
    const triggers = ScriptApp.getProjectTriggers();
    let triggerRemoved = false;
    
    // 月次集計トリガーを検索して削除
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'createMonthlyReport') {
        ScriptApp.deleteTrigger(trigger);
        triggerRemoved = true;
      }
    });
    
    if (triggerRemoved) {
      console.log("月次集計トリガーを削除しました");
      SpreadsheetApp.getUi().alert("月次集計トリガーを削除しました");
      return "月次集計トリガーを削除しました";
    } else {
      console.log("月次集計トリガーはありませんでした");
      SpreadsheetApp.getUi().alert("月次集計トリガーはありませんでした");
      return "月次集計トリガーはありませんでした";
    }
  } catch (error) {
    console.error("トリガー削除エラー: " + error.toString());
    SpreadsheetApp.getUi().alert("エラーが発生しました: " + error.toString());
    return "エラーが発生しました: " + error.toString();
  }
}

/**
 * 月次集計を手動で実行する関数
 * メニューアクションから呼び出すためのトリガー関数
 */
function runMonthlyReportManually() {
  try {
    const result = createMonthlyReport();
    const ui = SpreadsheetApp.getUi();
    
    if (result) {
      ui.alert('月次レポート作成', '月次レポートが正常に作成されました。', ui.ButtonSet.OK);
    } else {
      ui.alert('月次レポート作成エラー', 
               '月次レポートの作成中にエラーが発生しました。\n詳細はログを確認してください。', 
               ui.ButtonSet.OK);
    }
  } catch (error) {
    console.error('月次レポート作成実行エラー: ' + error.toString());
    logDetailedError("runMonthlyReportManually", error);
    
    const ui = SpreadsheetApp.getUi();
    ui.alert('エラー', 
             '処理中に予期しないエラーが発生しました: ' + error.toString(), 
             ui.ButtonSet.OK);
  }
}

/**
 * 詳細なエラーログを記録する関数
 * @param {string} location - エラーが発生した場所
 * @param {Error|string} error - エラーオブジェクトまたはエラーメッセージ
 * @param {Object} context - エラーに関連する追加情報
 */
function logDetailedError(location, error, context = {}) {
  try {
    // エラー詳細の抽出
    const errorDetails = {
      location: location,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : "スタックトレースなし",
      timestamp: new Date().toISOString(),
      context: JSON.stringify(context)
    };
    
    // コンソールへログ出力
    console.error(`[${errorDetails.location}] ${errorDetails.message}`);
    console.error(`Stack: ${errorDetails.stack}`);
    console.error(`Context: ${errorDetails.context}`);
    
    // スプレッドシートのエラーログシートに記録
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      let errorSheet = ss.getSheetByName("エラーログ");
      
      // エラーログシートがなければ作成
      if (!errorSheet) {
        errorSheet = ss.insertSheet("エラーログ");
        // ヘッダー設定
        errorSheet.getRange("A1:E1").setValues([["タイムスタンプ", "場所", "メッセージ", "スタック", "コンテキスト"]]);
        errorSheet.getRange("A1:E1").setFontWeight("bold").setBackground("#f3f3f3");
        errorSheet.setFrozenRows(1);
      }
      
      // エラー情報をログに追加
      errorSheet.appendRow([
        errorDetails.timestamp,
        errorDetails.location,
        errorDetails.message,
        errorDetails.stack,
        errorDetails.context
      ]);
      
      // 列幅の調整（初回のみ）
      if (errorSheet.getLastRow() <= 2) {
        errorSheet.setColumnWidth(1, 180); // タイムスタンプ
        errorSheet.setColumnWidth(2, 150); // 場所
        errorSheet.setColumnWidth(3, 300); // メッセージ
        errorSheet.setColumnWidth(4, 400); // スタック
        errorSheet.setColumnWidth(5, 200); // コンテキスト
      }
    } catch (logError) {
      // エラーログ記録自体でエラーが発生した場合はコンソールだけに出力
      console.error("エラーログ記録中にエラー: " + logError.toString());
    }
    
    return errorDetails;
  } catch (metaError) {
    // エラー処理中にエラーが発生した場合
    console.error("エラーログ機能でエラー: " + metaError.toString());
    return { message: String(error), metaError: String(metaError) };
  }
}

// 安全にセル範囲を結合するヘルパー関数
function safelyMergeRange(sheet, arg1, arg2, arg3, arg4) {
  try {
    let range;
    
    // 引数の型によって処理を分岐
    if (typeof arg1 === 'string') {
      // A1:B2 形式の文字列が渡された場合
      range = sheet.getRange(arg1);
    } else if (typeof arg1 === 'number' && typeof arg2 === 'number') {
      if (typeof arg3 === 'number' && typeof arg4 === 'number') {
        // 行、列、行数、列数の4つの引数が渡された場合
        range = sheet.getRange(arg1, arg2, arg3, arg4);
      } else {
        // 行、列の2つの引数だけが渡された場合（セル1つ）
        range = sheet.getRange(arg1, arg2);
      }
    } else {
      throw new Error("無効な引数: safelyMergeRangeには文字列（'A1:B2'形式）または行・列の数値が必要です");
    }
    
    // 範囲を結合
    return range.merge();
  } catch (error) {
    console.error(`セル結合エラー: ${error.toString()}`);
    
    // エラーの詳細をログに記録
    try {
      const rangeStr = typeof arg1 === 'string' ? arg1 : 
        (typeof arg3 === 'number' && typeof arg4 === 'number') ? 
        `(${arg1},${arg2},${arg3},${arg4})` : `(${arg1},${arg2})`;
        
      logDetailedError("safelyMergeRange", error, {range: rangeStr});
    } catch (e) {
      console.error("ログ記録中にエラー: " + e.toString());
    }
    
    // エラーが発生した場合は、結合せずに範囲を返す
    try {
      if (typeof arg1 === 'string') {
        return sheet.getRange(arg1);
      } else if (typeof arg1 === 'number' && typeof arg2 === 'number') {
        if (typeof arg3 === 'number' && typeof arg4 === 'number') {
          return sheet.getRange(arg1, arg2, arg3, arg4);
        } else {
          return sheet.getRange(arg1, arg2);
        }
      }
    } catch (e) {
      console.error("範囲取得中にエラー: " + e.toString());
      // 最終的な回避策：空のレンジを返す
      return {
        setBackground: function() { return this; },
        setFontWeight: function() { return this; },
        setValue: function() { return this; }
      };
    }
  }
}

/**
 * ステータス行を表示する関数
 * @param {Sheet} sheet - 表示するシート
 * @param {number} rowIndex - 表示する行番号
 * @param {string} status - ステータス名
 * @param {Object} statusData - ステータスデータ
 * @param {Date} lastUpdate - 最新更新日
 */
function displayStatusRow(sheet, rowIndex, status, statusData, lastUpdate) {
  try {
    // ステータス名
    sheet.getRange(rowIndex, 6).setValue(status);
    
    // 件数
    sheet.getRange(rowIndex, 7).setValue(statusData.count);
    
    // カテゴリ別内訳
    if (statusData.categories) {
      const topCategories = Object.entries(statusData.categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat, count]) => `${cat}: ${count}`)
        .join(", ");
      
      sheet.getRange(rowIndex, 8).setValue(topCategories);
    }
    
    // 最近の更新
    if (lastUpdate) {
      const formattedDate = Utilities.formatDate(lastUpdate, "JST", "yyyy/MM/dd HH:mm");
      sheet.getRange(rowIndex, 9).setValue(formattedDate);
    } else {
      sheet.getRange(rowIndex, 9).setValue("なし");
    }
    
    // ステータスに応じた背景色設定
    if (status === "未対応") {
      sheet.getRange(rowIndex, 6).setBackground("#FFCCCC");
    } else if (status === "対応中") {
      sheet.getRange(rowIndex, 6).setBackground("#FFFFCC");
    } else if (status === "成約") {
      sheet.getRange(rowIndex, 6).setBackground("#CCFFCC");
    }
  } catch (error) {
    console.error(`ステータス行表示エラー(${status}): ${error.toString()}`);
    logDetailedError("displayStatusRow", error, {status: status, rowIndex: rowIndex});
  }
}