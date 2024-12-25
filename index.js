(function start() {
  const child = require("child_process")
    .spawn("node", ["main.js", ...process.argv.slice(2)], {
      stdio: ["inherit", "inherit", "inherit", "ipc"],
    })
    .on("message", (msg) => {
      if (msg === "restart") {
        child.kill();
        start();
        delete child;
      }
    })
    .on("close", (code) => {
      if (!(code == null)) {
        child.kill();
        start();
        delete child;
      }
    })
    .on("error", (err) => console.log(err.message));
})();
