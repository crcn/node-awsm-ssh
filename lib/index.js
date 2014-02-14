var path      = require("path"),
child_process = require("child_process"),
exec          = child_process.exec,
spawn         = child_process.spawn,
sprintf       = require("sprintf").sprintf,
fs            = require("fs"),
readline      = require("readline"),
async         = require("async"),
LineWrapper   = require("stream-line-wrapper");

require("colors");


function getSSHOptions (awsm, self, args) {

  var defaultKeyDir = awsm.config.get("keyPath") || "~/.awsm/";

  var ops = args.shift() || {};


  var keyPath = ops.keyPath     || path.join(defaultKeyDir, self.get("region"), self.get("keyName")),
  user        = ops.user        || self.get("tags.user") || "root",
  port        = ops.port        || 22,
  interactive = ops.interactive || false,
  address     = self.get("addresses.publicIp");

  keyPath = keyPath.replace("~", process.env.HOME).replace(/^\./, process.cwd());

  return {
    interactive : ops.interactive,
    port        : port,
    keyPath     : keyPath,
    address     : address,
    user        : user,
    args        : ["-t", "-t", "-i", keyPath, user + "@" + address, "-o", "StrictHostKeyChecking=no"]
  }
}

module.exports = function (awsm) {

  // executes a command on the remote server
  awsm.chainer.add("instance.exec", {
    type: "object",
    call: function (options, sudo, next) {

      var args = Array.prototype.slice.call(arguments, 0),
      next     = args.pop(),
      script   = args.shift(),
      sudo     = args.pop();

      if (typeof script !== "string") {
        return next(new Error("must provide a script to execute"));
      }

      var script = options.replace("~", process.env.HOME).replace(/^\./, process.cwd());

      var args = Array.prototype.slice.call(arguments, 0),
      next     = args.pop();

      var ops = getSSHOptions(awsm, this, args);


      if (!ops.address) {
        return next();
      }


      var command = ops.args.concat(["-o", "LogLevel=quiet"]), 
      self = this, 
      isFile = fs.existsSync(script),
      tmpFile = "/tmp/script.sh";

      if (isFile) {
        command = command.concat("''" + (sudo ? "sudo sh " : "") + tmpFile + "; rm " + tmpFile + "''");
        scp();
      } else {
        command = command.concat("''" + script + "''")
        ssh();
      }


      function logProcess (proc) {

        var label = (self.get("_id") + "# ").cyan;

        function logger (from, to) {


          var wrapper = new LineWrapper({ prefix: label });
          from.pipe(wrapper).pipe(to);


        }

        logger(proc.stdout, process.stdout);
        logger(proc.stderr, process.stderr);


        return proc;
      }


      function scp () {
        var scpCommand = ["-i", ops.keyPath, script, ops.user + "@" + ops.address + ":" + tmpFile];

        console.log("scp", scpCommand.join(" "));

        var scp = logProcess(spawn("scp", scpCommand));

        scp.on("error", function() {});

        scp.on("exit", function (code) {

          if (code !== 0) {
            return next(new Error("unable to run " + script));
          }

          ssh();
        })
      }

      function ssh () {

        console.log("ssh", command.join(" "));

        var ssh = logProcess(spawn("ssh", command));

        ssh.on("exit", function (code) {
          next(null, {
            _id    : self.get("_id"),
            code   : code,
            result : "complete"
          });
        });
      }

    }
  });


  // returns the SSH strings for a given instance
  awsm.chainer.add("instance.ssh", {
    type: "object",
    call: function (options, next) {

      var args = Array.prototype.slice.call(arguments, 0),
      next     = args.pop();

      var ops = getSSHOptions(awsm, this, args), self = this;

      var ret = {
        _id   : this.get("_id"),
        state : this.get("state")
      }

      if (ops.address) {
        ret.command = ["ssh"].concat(ops.args).join(" ");
      }

      if (!ops.interactive) return next(null, ret);

      var proc = spawn("ssh", ops.args);

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