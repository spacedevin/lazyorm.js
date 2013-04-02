/**
 * LazyOrm
 * 
 * Retrieve remote database objects and store them locally, lazily.
 * Maps local javascripts to localstorage and remote rest endpoints as 
 * lazy as possible. Attempts to load objects from memory first by 
 * unique ID. Falls back to websql. If it doesn't exist in the local 
 * websql, loads from rest endpoint into websql db, and returns the 
 * javascript object.
 *
 * Can be called lazy, single callback, or unlazy, callback first for 
 * local, then again for the remote update.
 * 
 * By Devin Smith (devin.la)
 * https://github.com/arzynik/lazyorm.js
 *
 */


var $LazyOrm = {
	init: function(params) {
		if ($LazyOrm._init && !params.force) {
			return;
		}

		$LazyOrm._init = true;

		 // string endpoint. ex: http://api.droplet.la/
		if (params.server) {
			$LazyOrm.server = params.server;
		}
		
		// localstorage db object.
		if (params.db) {
			$LazyOrm.db = params.db;
		}
		
		// request function. ex: function(url, params, callback)
		$LazyOrm.request = params.request || $.getJSON;
		
		// method to use to save
		$LazyOrm.verbUpdate = params.verbCreate || 'POST';
		
		// method to use to create
		$LazyOrm.verbCreate = params.verbCreate || 'POST';
		
		for (var x in $Cache) {
			if (x.substr(0,1) == '_') {
				continue;
			}
			$Cache[x]._cached = {};
			var a = function(x) {
				$O[x] = function(id, complete) {
					return $Cache._get(x, id, complete);
				};
			};
			a(x);
		}
	}
};

var LazyOrm = {

	_loadComplete: function(data, complete) {

		for (var x in data) {
			this[x] = data[x];
		}

		if (complete) {
			complete.call(this);
		}
		
		this._triggerSuccess();
	},

	_init: function() {
		if (typeof arguments[0] == 'object') {
			for (var x in arguments[0]) {
				this[x] = arguments[0][x];
			}
		} else {
			this._id = arguments[0];		
		}

		this.type = arguments[2];
	},

	_saveToDb: function() {
		var self = this, complete, id, q;

		if (arguments[0] && typeof arguments[0] === 'function') {
			complete = arguments[0];
			id = self._id;
		} else if (arguments[1] && typeof arguments[1] === 'function') {
			complete = arguments[1];
			id = arguments[0];	
		}

		var success = function(tx, r) {
			self._localyStored = true;
			if (typeof complete === 'function') {
				complete.call(self, true, r);
			}
		};

		var error = function(tx, e) {
			if (typeof complete === 'function') {
				complete.call(self, false, e);
			}
		};

		var q = {
			r: [JSON.stringify(this.properties()), id]
		};
		
		if (this._localyStored) {
			// update the local resource
			q.q = 'UPDATE ' + $Cache[self.type].resourceLocal + ' SET data=? WHERE id=?';

		} else {
			// create a local resource. if it fails due to it already existing, fallback to update
			q.q = 'INSERT INTO ' + $Cache[self.type].resourceLocal + ' (data, id) VALUES(?,?)';
		}

		$LazyOrm.db.transaction(function(tx) {
			tx.executeSql(q.q, q.r, success, error);
		}, error);
	},

	_loadFromResource: function(id, complete) {
		var self = this;
		$LazyOrm.request($LazyOrm.server + $Cache[self.type].resourceRemote + '/' + self._id, {}, function(json) {
			if (json && json.error) {
				throw 'LazyOrm: Failed to load form remote resource: ' + json.error + "\nType: " + self.type + "\nResource: " + $Cache[self.type].resourceRemote + "\nID: " + self._id;
				complete.call(self, null);
			} else {
				complete.call(self, json);
			}
		});
	},
	
	_loadFromDb: function(id, complete) {
		var self = this;

		var results = function(tx, r) {

			var len = r.rows.length;

			if (len) {
				self._localyStored = true;
				complete.call(self, JSON.parse(r.rows.item(0).data));

			} else {
				complete.call(self, null);
			}
		};

		var error = function() {
			complete.call(self, null);
		};

		$LazyOrm.db.transaction(function(tx) {
			tx.executeSql('SELECT * FROM ' + $Cache[self.type].resourceLocal + ' WHERE id=?', [self._id], results, error);
		}, error);
	},

	_update: function(complete) {
		if (typeof complete !== 'function') {
			complete = function() {};
		}
		this._loadFromResource(this._id, complete);
	},
	
	_triggerSuccess: function() {
		$(document).trigger('orm-load-' + this.type + '-success-' + this._id, this);
	},
	
	_triggerUpdated: function() {
		$(document).trigger('orm-load-' + this.type + '-update-' + this._id, this);
	},

	properties: function() {
		var properties = {};
		for (var name in this) {
			if (name.indexOf('_') !== 0 && !$.isFunction(this[name])) {
				if (this[name] === true) {
					properties[name] = 1;
				} else if (this[name] === false) {
					properties[name] = 0;
				} else {
					properties[name] = this[name];
				}
			}
		}
		return properties;
	},

	loadType: function(cls, data) {
		if (!this['__' + data]) {
			this['__' + data] = [];
			for (x in this['_' + data]) {
				this['__' + data][this['__' + data].length] = App.cache(cls, this['_' + data][x]);
			}
			this['_' + data] = null;
		}
		return this['__' + data];
	},

	// save up to the server
	save: function(complete) {
		if (!this.type) return;
		$.post($LazyOrm.server + this.resource + (this._id ? ('/' + this._id) : ''), this.properties(), function(result) {
			if (complete) {
				complete(result);
			}
		});
	},

	// lazy promise that the resource will come back with a single callback
	lazy: function(complete) {
		return self.load(complete, true);
	},

	// load a resource without being lazy. can double trigger a callback
	load: function(complete, lazy) {
		var self = this;
		var updated = false;
		
		var success = function(data, scomplete) {
			self._loadComplete.call(self, data, function() {
				complete.call(self);
				
				if (typeof scomplete === 'function' && updated) {
					scomplete();
				}

				if (!lazy && !updated) {
					this._loadFromResource(this._id, resLoaded);
				}
			});
		}
		
		var resLoaded = function(data) {
			updated = true;
			var scomplete = function() {
				self._saveToDb();
			};
			if (data && data.id) {
				//this.save();
				success(data, scomplete);
			} else {
				success(null);
			}
		};
		
		var dbLoaded = function(data) {	
			if (data && data.id) {	
				success(data);
			} else {
				this._loadFromResource(this._id, resLoaded);
			}
		}
		
		if (self.id) {
			// we already have the id cached, which means we already have an object
			success(self);
		} else {
			this._loadFromDb(this._id, dbLoaded);
		}

		return this;
	},
	
	success: function(fn) {
		var self = this;
		$(document).one('orm-load-' + this.type + '-success-' + this._id, function() {
			fn.call(self);
		});
		return self;
	},
	
	update: function(fn) {
		// bind AND call update
		var self = this;
		$(document).one('orm-load-' + this.type + '-update-' + this._id, function() {
			fn.call(self);
		});
		self._update(function() {
			self._triggerUpdated();
		});
		return self;
	}
};

var $Cache = {
	_get: function(pe, id, complete) {
		var t={y:pe};
		if (!$Cache[pe]._cached[id]) {
			$Cache[pe]._cached[id] = new $LazyOrm[t['y']](id, complete, t['y']);
		}

        return $Cache[pe]._cached[id];
	},
	_query: function(type, id) {
		
	}
};

var $O = {};

window.DBsync = function(complete) {
	var createDBs = function(tx) {
		for (var x in $Cache) {
			if (x.substr(0,1) == '_') {
				continue;
			}
			tx.executeSql('CREATE TABLE IF NOT EXISTS `' + $Cache[x].resourceLocal + '` (id unique, data)');
		}
	};
	$LazyOrm.db.transaction(createDBs, complete, complete);
};
