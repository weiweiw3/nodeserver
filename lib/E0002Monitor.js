var fbutil = require('./fbutil');
var DynamicPathMonitor = require('./DynamicPathMonitor');
var today = new Date();

function E0002Monitor(firebaseUrl, path) {
    this.event = 'E0002';
    this.path = path;
    this.ref = fbutil.fbRef(firebaseUrl, path.messageRoot + '/' + this.event); //root of E0001 events
    this.userRootRef = fbutil.fbRef(firebaseUrl, path.userRoot);
    this.usermappingRef = fbutil.fbRef(firebaseUrl, path.usermappingRoot);
    this.rootRef = fbutil.fbRef(firebaseUrl, '/');


    console.log('Indexing %s/%s using path "%s"'.grey,
        path.index, path.type, fbutil.pathName(this.ref));

    this.index = path.index;
    this.type = path.type;
    this.filter = path.filter || function() {
        return true;
    };
    this.parse = path.parser || function(data) {
        return parseKeys(data, path.fields, path.omit);
    };

    this._init();
}

E0002Monitor.prototype = {

    _init: function() {
        this.addMonitor = this.ref.on('child_added',
            this._process.bind(this, this._childAdded));

        this.changeMonitor = this.ref.on('child_changed',
            this._process.bind(this, this._childChanged));

        this.removeMonitor = this.ref.on('child_removed',
            this._process.bind(this, this._childRemoved));
    },

    updateMessage: function(key) {
        var self = this;
        var ServeruserId = key;
        var FBuserId, UserMessageRef;
        var rootRefStr = self.rootRef.toString();

        //ServerUser 100001的Event/E0002/100001/4500017496进行如下处理：
        //Step 1, 更新到FBUsersimplelogin:25下面user/simplelogin:25/messages/E0002/4500017496
        //Step 2, 如果E0001/4500017496存在，同时把信息增加到FBUsersimplelogin:25下面user/simplelogin:25/messages/E0001/4500017496/data/last
        //Step 3，如果E0001/4500017496已经不存在，在步骤1增加的E0002/4500017496中增加信息,原订单已经被挪除{origin:false}
        //中间要利用UserList/100001/FBUser:simplelogin:25进行User映射
        self.usermappingRef.child(ServeruserId).once('value', function(snap) {


            if (snap.child(self.path.usermapping_FBuser_field).exists()) {

                FBuserId = snap.child(self.path.usermapping_FBuser_field).val();

                UserMessageRef = self.userRootRef.child(FBuserId)
                    .child(self.path.user_message_field).child(self.event);

                step1();

                updateComponents();
            }
            
            function step2(POId,data){
                                        var E0001_ref = self.userRootRef.child(FBuserId)
                                                                        .child(self.path.user_message_field)
                                                                        .child('E0001').child(POId).child('data');
                                        var updateE0001=false;
                                        var object={last:data};
                                        E0001_ref.transaction(function(currentData) {
                                            if(currentData==null){
                                                return
                                            }
                                            else
                                            {
                                                updateE0001=true;
                                                return object;
                                                
                                            }
                                        
                                            
                                        });
                                        return updateE0001;
                                                        
                                    }
            function step1() {
            var EventRef=self.ref.child(ServeruserId);
                EventRef.once('value', function(snap) {
                    snap.forEach(function(childsnap) {
                                var POId = childsnap.key();
                                var E0002Data = {
                                    "message":childsnap.child('RETURN/message').val(),
                                    "task_status":childsnap.child('TASK_INFO/task_status').val(),
                                    "date":childsnap.child('TASK_INFO/endTime').val(),
                                    "id":POId
                                };
                                //in users/simplelogin%3A25/messages/E0001/02_PU/4500017496 insert message数据
                                // in the same time, insert into E0002
                                var E0002_ref = self.userRootRef.child(FBuserId)
                                                .child(self.path.user_message_field)
                                                .child(self.event).child(POId);
                                E0002_ref.transaction(function(currentData) {
                                    return E0002Data;
                                });
                                
                                if(!step2(POId,E0002Data)){
                                    console.log('E0001/ '+POId+' has been removed');
                                    step3(false);
                                }
                                else{
                                    step3(true);
                                    console.log('E0001/ '+POId+' has been updated');

                                }
                                
                                function step3(origin){
                                    E0002_ref.child('origin')
                                        .transaction(function(currentData) {return origin;});
                                }
            
                                
            
                                });
                            });
                    
                

            }
            
            
            
            function updateComponents() {
                //in users/simplelogin%3A25/messages/E0001/02_PU/4500017496 insert message数据
                self.userRootRef.child(FBuserId).child(self.path.user_message_field)
                    .child(self.event)
                    .once('value', function(snap) {

                        var unreadCount = 0;
                        var messageArray={};  
                        snap.forEach(function(childsnap) {
                            if (typeof childsnap.child('date').val()  !== "undefined") {
                                 messageArray[childsnap.key()]=childsnap.child('date').val();
                            }else{
                                 messageArray[childsnap.key()] = today.valueOf();
                            }
                           
                            if (!childsnap.child('data/read').val()) {
                                unreadCount++;
                            }
                        });

                        var messageCount = snap.numChildren();

                        var component_data = {
                            "config": 'x',
                            "last": today.valueOf(),
                            "messageCount": messageCount,
                            "name": self.event,
                            "priority": '1',
                            "unreadCount": unreadCount,
                            "messages":messageArray
                        };
                        //users/simplelogin%3A25/components update E0001
                        self.userRootRef.child(FBuserId).child(self.path.user_component_field)
                            .child(self.event).set(component_data);

                    });

            }

        });

    },
    deleteMessage: function(key) {
       
    },
    _stop: function() {
        this.ref.off('child_added', this.addMonitor);
        this.ref.off('child_changed', this.changeMonitor);
        this.ref.off('child_removed', this.removeMonitor);
    },

    _process: function(fn, snap) {
        var dat = snap.val();
        //   if( this.filter(dat) ) {
        fn.call(this, snap.key(), this.parse(dat));
        //   }
    },

    _childAdded: function(key, data) {
        var name = nameFor(this, key);
        // console.log('_childAdded'.green, this.index, this.type, data, key);
        this.updateMessage(key);
        // this.deleteMessage(key);
    },

    _childChanged: function(key, data) {
        var name = nameFor(this, key);
        this.updateMessage(key);
        //  console.log('_childChanged'.green, this.index, this.type, name, key);
        // this.deleteMessage(key);
    },

    _childRemoved: function(key, data) {
        var name = nameFor(this, key);
        var self = this;
        this.updateMessage(key);
        // this.deleteMessage(key);


    }
};



function nameFor(path, key) {
    return path.index + '/' + path.type + '/' + key;
}

function parseKeys(data, fields, omit) {
    if (!data || typeof(data) !== 'object') {
        return data;
    }
    var out = data;
    // restrict to specified fields list
    if (Array.isArray(fields) && fields.length) {
        out = {};
        fields.forEach(function(f) {
            if (data.hasOwnProperty(f)) {
                out[f] = data[f];
            }
        })
    }
    // remove omitted fields
    if (Array.isArray(omit) && omit.length) {
        omit.forEach(function(f) {
            if (out.hasOwnProperty(f)) {
                delete out[f];
            }
        })
    }
    return out;
}

exports.process = function(firebaseUrl, paths, dynamicPathUrl) {
    console.log(firebaseUrl, paths, 'dynamicPathUrl'.green, dynamicPathUrl);

    paths && paths.forEach(function(pathProps) {
        new E0002Monitor(firebaseUrl, pathProps);
    });
    if (dynamicPathUrl) {
        console.log('dynamicPathUrl'.green, dynamicPathUrl);
        new DynamicPathMonitor(fbutil.fbRef(firebaseUrl, dynamicPathUrl), function(pathProps) {
            return new E0002Monitor(firebaseUrl, pathProps);
        });
    }
};
