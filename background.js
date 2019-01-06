chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create(
    "window.html",
    {
      outerBounds: {
        width: 800,
        height: 400
      }
    },
    function(win) {
      // Disconnect all connections
      win.onClosed.addListener(function(e) {
        chrome.serial.getConnections(function(conns) {
          for (let conn of conns) {
            console.log("Disconnecting connectionId: " + conn.connectionId);
            chrome.serial.disconnect(conn.connectionId, function(result) {
              console.log(
                "Disconnecting connectionId: " +
                  conn.connectionId +
                  " ret=" +
                  result
              );
            });
          }
          console.log(conns);
        });
      });
    }
  );
});
