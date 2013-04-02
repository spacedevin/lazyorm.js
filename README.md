lazyorm.js
===========

Description
-----------
Maps local javascript objects to localstorage and remote rest endpoints as lazy as possible.
Attempts to load objects from memory first by unique ID. Falls back to websql. If it doesn't exist in the local websql, loads from rest endpoint into websql db, and returns the javascript object. 

Can be called lazy, single callback, or unlazy, callback first for local, then again for the remote update.

Usage
-----

Init the lib with the server
```
$LazyOrm.init({
	server: 'http://api.droplet.la/'
});
```

Create a new user object
```
$LazyOrm.User = function(id) {
	$.extend(this, LazyOrm);
	this._init.apply(this, arguments);
}

$Cache.User = {
	id: 'id',
	resourceRemote: 'user',
	resourceLocal: 'user'
};

```

Read an image object using the object cache lazily.
```
$O.User('devin')
	.load(function() {
		console.log(this);
	});
```

Read a user object using the object cache unlazily. this will callback the passed function twice.
```
$O.User('devin')
	.load(function() {
		console.log(this);
	});
```

Use it with [AngularJS](http://angularjs.org/). You will have to check the scope phase as sometimes it will be called async, and sometimes not.
```
App.controller('user', function ($scope, $routeParams) {
	$O.User($routeParams.id)
		.load(function() {
			if (!$scope.$$phase) {
				$scope.$apply(function() {
					$scope.user = this.properties();
				});
			} else {
				$scope.user = this.properties();
			}
		});
});
```

Requirements
------------
* [jQuery](http://jquery.com)
