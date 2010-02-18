/**
 * Fetch an HTTP url to a local file.
 **/

var http = require("http"),
  url = require("url"),
  sys = require("sys"),
  fs = require("fs"),
  utils = require("./index"),
  Promise = require("events").Promise;

module.exports = function fetch (remote, local, headers) {
  var p = new Promise();
  headers = headers || {};
  headers.host = url.parse(remote).hostname;
  
  fs.open(
    local,
    process.O_CREAT | process.O_WRONLY | process.O_TRUNC,
    0755
  ).addErrback(function () {
    p.emitError("could not open "+local+" for writing.");
  }).addCallback(function (fd) {
    fetchAndWrite(remote, fd, p, headers);
  });
  
  return p;
};

function fetchAndWrite (remote, fd, p, headers, maxRedirects, redirects) {
  redirects = redirects || 0;
  maxRedirects = maxRedirects || 10;
  remote = url.parse(remote);
  utils.set(headers, "host", remote.hostname);
  remote.path = remote.pathname+(remote.search||"")+(remote.hash||"");
  http
    .createClient(remote.port || (remote.protocol === "https:" ? 443 : 80), remote.hostname)
    .request("GET", (remote.pathname||"/")+(remote.search||"")+(remote.hash||""), headers)
    .addListener("response", function (response) {
      // handle redirects.
      var loc = utils.get(response.headers, "location");
      if (loc && loc !== remote.href && redirects < maxRedirects) {
        // This is a laughably naïve way to handle this situation.
        // @TODO: Really need a full curl or wget style module that would 
        // do all this kind of stuff for us.
        var cookie = utils.get(response.headers, "Set-Cookie");
        if (cookie) {
          cookie = cookie.split(";").shift();
          utils.set(headers, "Cookie", cookie);
        }
        return fetchAndWrite(loc, fd, p, headers, maxRedirects, redirects + 1);
      }
      
      // don't set the encoding, because we're just going to write the bytes as-is
      response.addListener("data", function (chunk) {
        // write the chunk...
        fs.write(fd, chunk)
          .addErrback(function () {
            p.emitError("write error");
          });
      })
      response.addListener("error", utils.method(p, "emitError"));
      response.addListener("end", utils.method(p, "emitSuccess"));
    })
    .close();
}