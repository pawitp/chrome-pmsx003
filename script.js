const PM_2_5_AQI = [
  [0, 12.0, 0, 50],
  [12.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 150.4, 151, 200],
  [150.5, 250.4, 201, 300],
  [250.5, 350.4, 301, 400],
  [350.5, 500.4, 401, 500]
];

const PM_10_AQI = [
  [0, 54, 0, 50],
  [55, 154, 51, 100],
  [155, 254, 101, 150],
  [255, 354, 151, 200],
  [355, 424, 201, 300],
  [425, 504, 301, 400],
  [505, 604, 401, 500]
];

const AQI_COLORS = [
  [50, "#00e400"],
  [100, "#ff0"],
  [150, "#ff7e00"],
  [200, "#f00"],
  [300, "#99004c"],
  [500, "#7e0023"]
];

function calculateAqi(table, raw) {
  for (let row of table) {
    if (raw < row[1]) {
      return parseInt(
        ((row[3] - row[2]) / (row[1] - row[0])) * (raw - row[0]) + row[2]
      );
    }
  }
  return -1;
}

function calculateAqiColor(aqi) {
  for (let row of AQI_COLORS) {
    if (aqi <= row[0]) return row[1];
  }
}

window.onload = function() {
  var connectionId = 0;
  var logWriter;
  var useAtm = false; // With default to true on init
  const logElem = document.getElementById("log");
  const bufferElem = document.getElementById("buffer");
  const pm1_0Elem = document.getElementById("pm1_0");
  const pm2_5Elem = document.getElementById("pm2_5");
  const pm2_5AqiElem = document.getElementById("pm2_5_aqi");
  const pm10Elem = document.getElementById("pm10");
  const pm10AqiElem = document.getElementById("pm10_aqi");
  const logBtnElem = document.getElementById("log_btn");
  const toggleBtnElem = document.getElementById("toggle_btn");

  function log(txt) {
    logElem.innerHTML += "<br>[" + new Date() + "] " + txt;
  }

  const buffer = new Array(32).fill(0);
  function processInput(byte) {
    // Replace the byte with the new one we've received
    buffer.shift();
    buffer.push(byte);

    var bufferText = "Buffer: ";
    for (let b of buffer) {
      bufferText += b + " ";
    }
    bufferElem.innerHTML = bufferText;

    if (buffer[0] == 66 && buffer[1] == 77) {
      var check = 0;
      for (let i = 0; i < 30; i++) {
        check += buffer[i];
      }
      var checkHigh = parseInt(check / 256);
      var checkLow = parseInt(check % 256);
      if (buffer[30] == checkHigh && buffer[31] == checkLow) {
        var base = 0;
        if (useAtm) base = 6;
        const pm1_0 = buffer[base + 4] * 256 + buffer[base + 5];
        pm1_0Elem.innerHTML = pm1_0;
        const pm2_5 = buffer[base + 6] * 256 + buffer[base + 7];
        const pm2_5aqi = calculateAqi(PM_2_5_AQI, pm2_5);
        pm2_5Elem.innerHTML = pm2_5;
        pm2_5AqiElem.innerHTML = pm2_5aqi;
        pm2_5AqiElem.style.backgroundColor = calculateAqiColor(pm2_5aqi);
        const pm10 = buffer[base + 8] * 256 + buffer[base + 9];
        const pm10aqi = calculateAqi(PM_10_AQI, pm10);
        pm10Elem.innerHTML = pm10;
        pm10AqiElem.innerHTML = pm10aqi;
        pm10AqiElem.style.backgroundColor = calculateAqiColor(pm10aqi);
        
        if (logWriter) {
          const time = new Date().getTime();
          const logLine = time + "," + pm1_0 + "," + pm2_5 + "," + pm10 + "\n";
          logWriter.write(new Blob([logLine], { type: "text/plain" }));
        }
      } else {
        log("Checksum failed " + checkHigh + " " + checkLow);
      }
    }
  }

  const onConnect = function(connectionInfo) {
    // The serial port has been opened. Save its id to use later.
    connectionId = connectionInfo.connectionId;
    log("Connected with connection ID: " + connectionId);
  };

  const onGetDevices = function(ports) {
    log("Got devices:");
    for (let port of ports) {
      log(port.path);
    }

    if (ports.length > 0) {
      const device = ports[0].path;
      log("Connecting to " + device);
      chrome.serial.connect(
        device,
        { bitrate: 9600 },
        onConnect
      );
    }
  };
  chrome.serial.getDevices(onGetDevices);

  const onReceiveCallback = function(info) {
    if (info.connectionId == connectionId && info.data) {
      const buf = new Uint8Array(info.data);
      for (let ch of buf) {
        processInput(ch);
      }
    }
  };

  const onReceiveErrorCallback = function(info) {
    if (info.connectionId == connectionId) {
      log("Receive Error: " + info.error);
    }
  };

  chrome.serial.onReceive.addListener(onReceiveCallback);
  chrome.serial.onReceiveError.addListener(onReceiveErrorCallback);

  logBtnElem.onclick = function() {
    logBtnElem.disabled = true;
    chrome.fileSystem.chooseEntry({ type: "saveFile", suggestedName: "log.txt" }, function(file) {
      file.createWriter(
        function(writer) {
          log("Logging to file");
          logWriter = writer;
        },
        function(e) {
          log("Error writing file: " + e);
        }
      );
    });
  };

  toggleBtnElem.onclick = function() {
    useAtm = !useAtm;
    if (useAtm) {
      toggleBtnElem.innerHTML = "Using ATM";
    } else {
      toggleBtnElem.innerHTML = "Using CF1";
    }
  }

  for (let elem of document.getElementsByClassName("cmd")) {
    elem.onclick = function() {
      var cmd = elem.dataset.cmd;
      var ab = new ArrayBuffer(7);
      var buf = new Uint8Array(ab);
      buf[0] = parseInt(cmd.substring(0, 2), 16);
      buf[1] = parseInt(cmd.substring(2, 4), 16);
      buf[2] = parseInt(cmd.substring(4, 6), 16);
      buf[3] = parseInt(cmd.substring(6, 8), 16);
      buf[4] = parseInt(cmd.substring(8, 10), 16);

      var check = 0;
      for (let i = 0; i < 5; i++) {
        check += buf[i];
      }

      buf[5] = parseInt(check / 256);
      buf[6] = parseInt(check % 256);
      chrome.serial.send(connectionId, ab, (sendInfo) => {
        log("Sent " + sendInfo.bytesSent + " bytes");
      });
    }
  }

  // Initialize UI
  toggleBtnElem.onclick();
  processInput(0);

  log("Software initialized.");
};
