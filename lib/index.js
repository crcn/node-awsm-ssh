var path      = require("path"),
child_process = require("child_process"),
exec          = child_process.exec,
spawn         = child_process.spawn,
sprintf       = require("sprintf").sprintf,
SSH           = require("ssh2"),
fs            = require("fs"),
readline      = require("readline");

module.exports = function (awsm) {

  var defaultKeyDir = awsm.config.get("keyPath") || "~/.awsm/";

  awsm.chainer.add("instance.ssh", {
    type: "instance",
    call: function (options, next) {

      var ops = {};

      if (arguments.length === 1) {
        next = options;
      } else {
        ops = options;
      }

      var keyPath = ops.keyPath || path.join(defaultKeyDir, this.get("region"), this.get("keyName")),
      user        = ops.user || this.get("tags.user") || "root",
      port        = ops.port || 22;

      keyPath = keyPath.replace("~", process.env.HOME).replace(/^\./, process.cwd());

      var command;

      var proc = spawn("ssh", command = ["-t", "-t", "-i", keyPath, user + "@" + this.get("addresses.publicIp")]);

      console.log(["ssh"].concat(command).join(" "));

      awsm.cli.closeReadline();

      proc.stderr.pipe(process.stderr);
      proc.stdout.pipe(process.stdout);
      process.stdin.pipe(proc.stdin);
      process.stdin.resume();


      proc.on("exit", function () {
        awsm.cli.openReadline();
        next();
      })
    }
  });
};