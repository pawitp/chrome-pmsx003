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
  const logElem = document.getElementById("log");
  const lastUpdatedElem = document.getElementById("last_update");
  const bufferElem = document.getElementById("buffer");
  const pm2_5Elem = document.getElementById("pm2_5");
  const pm2_5AqiElem = document.getElementById("pm2_5_aqi");
  const pm10Elem = document.getElementById("pm10");
  const pm10AqiElem = document.getElementById("pm10_aqi");
  const logBtnElem = document.getElementById("log_btn");
  const toggleBtnElem = document.getElementById("toggle_btn");

  function log(txt) {
    logElem.innerHTML += "<br>[" + new Date() + "] " + txt;
  }

  const buffer = new Array(10).fill(0);
  function processInput(byte) {
    // Replace the byte with the new one we've received
    buffer.shift();
    buffer.push(byte);

    var bufferText = "Buffer: ";
    for (let b of buffer) {
      bufferText += b + " ";
    }
    bufferElem.innerHTML = bufferText;

    if (buffer[0] == 0xAA && buffer[9] == 0xAB) {
      var check = 0;
      for (let i = 2; i < 8; i++) {
        check += buffer[i];
      }
      check = parseInt(check % 256);
      if (buffer[8] == check) {
        var base = 2;
        const pm2_5 = (buffer[base + 1] * 256 + buffer[base + 0]) / 10;
        const pm2_5aqi = calculateAqi(PM_2_5_AQI, pm2_5);
        pm2_5Elem.innerHTML = pm2_5;
        pm2_5AqiElem.innerHTML = pm2_5aqi;
        pm2_5AqiElem.style.backgroundColor = calculateAqiColor(pm2_5aqi);
        const pm10 = (buffer[base + 3] * 256 + buffer[base + 2]) / 10;
        const pm10aqi = calculateAqi(PM_10_AQI, pm10);
        pm10Elem.innerHTML = pm10;
        pm10AqiElem.innerHTML = pm10aqi;
        pm10AqiElem.style.backgroundColor = calculateAqiColor(pm10aqi);
        lastUpdatedElem.innerHTML = new Date();
        
        if (logWriter) {
          const time = new Date().getTime();
          const logLine = time + ",-1," + pm2_5 + "," + pm10 + "\n";
          logWriter.write(new Blob([logLine], { type: "text/plain" }));
        }
      } else {
        log("Checksum failed " + check);
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
      const device = ports[2].path;
      log(JSON.stringify(ports));
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

  for (let elem of document.getElementsByClassName("cmd")) {
    elem.onclick = function() {
      var cmd = elem.dataset.cmd;
      var ab = new ArrayBuffer(19);
      var buf = new Uint8Array(ab);
      buf[0] = 0xAA;
      buf[1] = 0xB4;
      buf[2] = parseInt(cmd.substring(0, 2), 16);
      buf[3] = parseInt(cmd.substring(2, 4), 16);
      buf[4] = parseInt(cmd.substring(4, 6), 16);
      buf[15] = 0xFF;
      buf[16] = 0xFF;

      var check = 0;
      for (let i = 2; i < 17; i++) {
        check += buf[i];
      }

      buf[17] = parseInt(check % 256);
      buf[18] = 0xAB;
      chrome.serial.send(connectionId, ab, (sendInfo) => {
        log("Sent " + sendInfo.bytesSent + " bytes");
      });
    }
  }

  // Initialize UI
  processInput(0);

  log("Software initialized.");
};
