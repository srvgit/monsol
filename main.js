const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const fs = require('fs');
const https = require('https');
const xlsx = require('xlsx');
const url = require('url');
const axios = require('axios');
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile('index.html');

    const mainMenu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(mainMenu);
}

const menuTemplate = [
    {
        label: 'File',
        submenu: [
            {
                label: 'Add Test Case',
                click() {
                    createAddTestCaseWindow();
                }
            },
            { type: 'separator' },
            {
                label: 'Exit',
                accelerator: process.platform === 'darwin' ? 'Command+Q' : 'Ctrl+Q',
                click() {
                    app.quit();
                }
            }
        ]
    }
];

function createAddTestCaseWindow() {
    let addWindow = new BrowserWindow({
        width: 400,
        height: 300,
        title: 'Add a Test Case',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    addWindow.loadFile('addTestCase.html');
    addWindow.on('close', () => { addWindow = null; });
}

ipcMain.on('send-test-case-data', (event, data) => {
  console.log('Test case data received:', data);
});
  // Handle the API request based on the received data
  function makeApiRequest(data, callback) {
    let options = {
        method: data.requestMethod,
        headers: JSON.parse(data.headers || '{}')
    };

    const req = https.request(data.apiEndpoint, options, (resp) => {
        let data = '';
        resp.on('data', (chunk) => { data += chunk; });
        resp.on('end', () => { callback(JSON.parse(data)); });
    });

    req.on('error', (err) => { callback({ error: err.message }); });

    if (data.requestBody) {
        req.write(data.requestBody);
    }

    req.end();
}

ipcMain.on('save-test-case', (event, data) => {
    dialog.showSaveDialog({
        title: 'Save Test Case',
        defaultPath: '~/test_case.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
    }).then(file => {
        if (!file.canceled) {
            fs.writeFileSync(file.filePath.toString(), JSON.stringify(data, null, 2), 'utf-8');
        }
    }).catch(err => {
        console.log('Error saving file:', err);
    });
});

ipcMain.on('load-test-case', async (event) => {
    let result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (!result.canceled) {
        let content = fs.readFileSync(result.filePaths[0], 'utf-8');
        event.sender.send('test-case-loaded', JSON.parse(content));
    }
});

function makeApiRequest(data, callback) {
  // Simplified example of making an HTTPS GET request
  https.get(data.apiEndpoint, (resp) => {
      let data = '';

      // A chunk of data has been received
      resp.on('data', (chunk) => {
          data += chunk;
      });

      // The whole response has been received
      resp.on('end', () => {
          callback(JSON.parse(data));
      });

  }).on("error", (err) => {
      console.log("Error: " + err.message);
      callback({ error: err.message });
  });
}


ipcMain.on('open-add-test-case-window', () => {
    createAddTestCaseWindow();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
ipcMain.on('load-excel-file', async (event) => {
  let result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }]
  });

  if (!result.canceled) {
      const workbook = xlsx.readFile(result.filePaths[0]);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(worksheet);

      const apiCollection = jsonData.map(row => {
          let fullUrl = new url.URL(row.uri, process.env.HOST_NAME);
          if (row.queryParameters) {
              fullUrl.search = new URLSearchParams(row.queryParameters).toString();
          }
          return {
              uri: fullUrl.href,
              method: row.httpMethod,
              // Add other relevant fields if necessary
          };
      });

      event.sender.send('excel-data-loaded', apiCollection);
  }
});

async function performApiRequests(apiCollection) {
  const responses = [];

  for (const api of apiCollection) {
      try {
          const response = await axios({
              method: api.method,
              url: api.uri,
              // Add more configuration based on your needs, like headers, body, etc.
          });
          responses.push({ uri: api.uri, status: response.status, data: response.data });
      } catch (error) {
          responses.push({ uri: api.uri, error: error.message });
      }
  }

  return responses;
}

ipcMain.on('execute-api-collection', async (event, apiCollection) => {
  const responses = await performApiRequests(apiCollection);
  event.sender.send('api-responses', responses);
});