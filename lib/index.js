var path      = require("path"),
child_process = require("child_process"),
exec          = child_process.exec,
spawn         = child_process.spawn,
sprintf       = require("sprintf").sprintf,
fs            = require("fs"),
readline      = require("readline"),
async         = require("async"),
LineWrapper   = require("stream-line-wrapper"),
readline      = require("readline"),
tty           = require("tty");

require("colors");


function getSSHOptions (awsm, self, ops) {

  var defaultKeyDir = awsm.config.get("keyPath") || "~/.awsm/";

  if (typeof ops === "string") {
    ops = { script: ops };
  }


  var keyPath = ops.keyPath     || path.join(defaultKeyDir, self.get("region"), self.get("keyName")),
  user        = ops.user        || self.get("tags.user") || "root",
  port        = ops.port        || 22,
  interactive = ops.interactive || false,
  address     = self.get("addresses.publicIp");

  keyPath = keyPath.replace("~", process.env.HOME).replace(/^\./, process.cwd());

  return {
    interactive : ops.interactive,
    port        : port,
    script      : fixPath(ops.script || ""),
    keyPath     : fixPath(keyPath),
    address     : address,
    user        : user,
    args        : ["-t", "-t", "-i", keyPath, user + "@" + address, "-o", "StrictHostKeyChecking=no"]
  }
}

function fixPath (path) {
  return path.replace("~", process.env.HOME).replace(/^\./, process.cwd());
}


function logProcess (self, proc) {

  var label = (self.get("_id") + "# ").cyan;

  function logger (from, to) {
    var wrapper = new LineWrapper({ prefix: label });
    from.pipe(wrapper).pipe(to);
  }

  logger(proc.stdout, process.stdout);
  logger(proc.stderr, process.stderr);


  return proc;
}

module.exports = function (awsm) {


  function closeReadline() {
    if (!awsm.cli) return;
    awsm.cli.closeReadline();
  }

  function openReadline() {
    if (!awsm.cli) return;
    awsm.cli.openReadline();
  }


  awsm.chainer.add("instance.rsync", {
    type: "object",
    call: function (ops, next) {

      var args = Array.prototype.slice.call(arguments, 0),
      next     = args.pop(),
      ops      = args.shift();

      if (typeof ops === "string") {
        ops = {
          from : ops,
          to   : args.shift()
        }
      }

      var ops2 = getSSHOptions(awsm, this, ops);

      if (!ops.from || !ops) {
        return next(new Error("must have from / to params"));
      }

      from = fixPath(ops.from);

      var command = ["rsync", "-avz", "--delete", "-e", sprintf("''ssh -o StrictHostKeyChecking=no -i %s''", ops2.keyPath), "--progress", ops.from, ops2.user + "@" + ops2.address + ":" + ops.to],
      self = this;

      function mkdirp () {
        var command = ["ssh"].concat(ops2.args).concat("''mkdir -p -v "+ path.dirname(ops.to) +"''")
        console.log(command.join(" "));
        logProcess(self, spawn(command.shift(), command)).on("exit", rsync);
      }


      function rsync () {

        console.log(command.join(" "));

        var proc = logProcess(self, spawn(command.shift(), command));


        proc.on("exit", function () {
          next();
        });
      }

      mkdirp();

    }
  })

  // executes a command on the remote server
  awsm.chainer.add("instance.exec", {
    type: "object",
    call: function execScript (options, sudo, next) {

      var args = Array.prototype.slice.call(arguments, 0),
      next     = args.pop(),
      ops      = getSSHOptions(awsm, this, args.shift()),
      sudo     = args.pop();
      
      var script = ops.script;

      if (typeof script !== "string") {
        return next(new Error("must provide a script to execute"));
      }


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
        command = command.concat("''" + (sudo ? "sudo sh " : "") + script + "''")
        ssh();
      }


      function scp () {
        var scpCommand = ["-o", "StrictHostKeyChecking=no", "-i", ops.keyPath, script, ops.user + "@" + ops.address + ":" + tmpFile];

        console.log("scp", scpCommand.join(" "));

        var scp = logProcess(self, spawn("scp", scpCommand));

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


        var proc;

        closeReadline();

        try {
          process.stdin.setRawMode(true);
        } catch (e) { }

        var ssh = logProcess(self, proc = spawn("ssh", command));


        process.stdin.resume();

        process.stdin.pipe(proc.stdin);


        ssh.on("exit", function (code) {

          try {
            process.stdin.setRawMode(false);
          } catch (e) { }
          process.stdin.resume();

          openReadline();

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

      closeReadline();

      proc.stderr.pipe(process.stderr);
      proc.stdout.pipe(process.stdout);
      process.stdin.pipe(proc.stdin);
      process.stdin.resume();


      proc.on("exit", function () {
        openReadline();
        next(null, self);
      })
    }
  });
};