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

// onOpenメニューにトリガー設定機能を追加
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('HOT情報管理')
    .addItem('新規データを転記', 'transferDataToManagementSheet')
    .addSeparator()
    .addItem('転記状況を確認', 'checkTransferStatus')
    .addItem('情報を検索', 'searchManagementSheet')
    .addSeparator()
    .addSubMenu(ui.createMenu('⚙️ 管理機能')
      .addItem('情報管理シートの再初期化（注意）', 'setupManagementSheet')
      .addItem('転記機能の診断実行', 'diagnoseTranfer')
    )
    .addToUi();
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