var formidable = require('formidable')
	, events = require('events')
	, util = require('util');

var ALLOWED_STREAM_ENCODING = ['utf8', 'ascii', 'base64'];

function StreamingForm () {}

util.inherits(StreamingForm, events.EventEmitter);

StreamingForm.prototype.parse = function (req, cb) {
	
	var sf = this;
	
	var form = new formidable.IncomingForm;
	
	form.on('field', function(n,v) { sf.emit('field',n,v); });
	
	form.onPart = function(part) {
		if (part.filename === undefined) {
			// Use the default handler
			form.handlePart(part);
		} else {
			 
			// create new FileStream and broadcast it
			var fs = new StreamingForm.FileStream(part.filename, part.mime, part.headers['content-length']);
			sf.emit('file', fs);
			
			//bind part to FileStream
			part.on('data', function (chunk) { fs.receive(chunk); });
			part.on('end', function () { fs.end(); });
		}
	};
	
	
	var endcb = (typeof(cb) === 'function') ? cb : function(){};
	
	form.on('end', endcb);
	form.on('error', endcb);
	
	form.parse(req);
};

StreamingForm.FileStream = function(name, mime, expectedSize) {
	this.name = name;
	this.mime = mime || 'application/octet-stream';
	this.expectedSize = expectedSize || null;
	this.size = 0;
	this.queue = [];
	
	console.log('Initiated filestream:' + JSON.stringify(this));
	
	this._encoding = null;
	
	this.writeable = false;
	this.readable = true;
	this.paused = false;
	
	this.setEncoding = function (encoding) {
		if (ALLOWED_STREAM_ENCODING.indexOf(encoding) !== -1) {
			this._encoding = encoding;
		} else this._encoding = null;
	};
	
};

util.inherits(StreamingForm.FileStream, events.EventEmitter);

StreamingForm.FileStream.prototype.pipe = function(dest) {
	util.pump(this, dest);
};

StreamingForm.FileStream.prototype.pause = function () {
	this.paused = true;
};

StreamingForm.FileStream.prototype.resume = function() {
	this.paused = false;
	while (this.flush());
	this.emit('resumed');
};

StreamingForm.FileStream.prototype._send = function (chunk) {
	this.emit('data', (this._encoding) ? chunk.toString(this._encoding) : chunk);
};

StreamingForm.FileStream.prototype.receive = function (chunk, next) {
	this.size += chunk.length;
	if (this.paused || this.queue.length > 0) {
		this.queue.push(chunk);
	} else this._send(chunk);
	if (typeof(next) === 'function') next.call(this);
};

StreamingForm.FileStream.prototype.flush = function () {
	
	if ( !this.paused && this.readable && this.queue.length > 0) {	
		this._send(this.queue.shift());	
		return true;
	}
	
	return false;
};

StreamingForm.FileStream.prototype.destroy = function() {
	
	this.end();
	
	this.queue = [];
	
	this.readable = false;
	
};

StreamingForm.FileStream.prototype.end = function(data) {
	
	if (typeof(data) !== 'undefined') {
		this.receive(chunk, function() { this.emit('end-called', this); });
	} else this.emit('end-called', this);
	  
	if (!this.paused) {
		while (this.flush());
		this._close();
	} else this.once('resumed', this._close);
	  
};

StreamingForm.FileStream.prototype._close = function() {
	this.readable = false;
	this.emit('end');
};

module.exports = StreamingForm;