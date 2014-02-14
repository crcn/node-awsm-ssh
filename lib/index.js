var path      = require("path"),
child_process = require("child_process"),
exec          = child_process.exec,
spawn         = child_process.spawn,
sprintf       = require("sprintf").sprintf,
fs            = require("fs"),
readline      = require("readline");


function getSSHOptions (awsm, self, args) {

  var defaultKeyDir = awsm.config.get("keyPath") || "~/.awsm/";

  var ops = args.shift() || {};


  var keyPath = ops.keyPath || path.join(defaultKeyDir, self.get("region"), self.get("keyName")),
  user        = ops.user || self.get("tags.user") || "root",
  port        = ops.port || 22,
  interactive = ops.interactive || false;

  return {
    interactive : ops.interactive,
    port        : port,
    keyPath     : keyPath.replace("~", process.env.HOME).replace(/^\./, process.cwd()),
    address     : self.get("addresses.publicIp"),
    user        : user
  }
}

module.exports = function (awsm) {

  // executes a command on the remote server
  awsm.chainer.add("instance.exec", {
    type: "object",
    call: function (options, next) {

      var args = Array.prototype.slice.call(arguments, 0),
      next     = args.pop();

      var ops = getSSHOptions(awsm, this, args);


    }
  });


  // returns the SSH strings for a given instance
  awsm.chainer.add("instance.ssh", {
    type: "object",
    call: function (options, next) {

      var args = Array.prototype.slice.call(arguments, 0),
      next     = args.pop();

      var ops = getSSHOptions(awsm, this, args);

      var command = ["-t", "-t", "-i", ops.keyPath, ops.user + "@" + ops.address], self = this;


      var ret = {
        _id: this.get("_id"),
        state: this.get("state")
      }

      if (ops.address) {
        ret.command = ["ssh"].concat(command).join(" ");
      }

      if (!ops.interactive) return next(null, ret);

      var proc = spawn("ssh", command);

      awsm.cli.closeReadline();

      proc.stderr.pipe(process.stderr);
      proc.stdout.pipe(process.stdout);
      process.stdin.pipe(proc.stdin);
      process.stdin.resume();


      proc.on("exit", function () {
        awsm.cli.openReadline();
        next(null, self);
      })
    }
  });
};