var fbutil = require('./fbutil');
var DynamicE0001Monitor = require('./DynamicPathMonitor');
var today = new Date();

function E0001Monitor(firebaseUrl, path) {
    this.event = 'E0001';
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

E0001Monitor.prototype = {

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

        //将 Server User 100001的Event/E0001/100001/02_PU/PO_HEADERS/4500017496进行如下处理：
        //(中间要利用UserList/100001/FBUser:simplelogin:25进行User映射)
        //step 1, 更新到FB User simplelogin:25下面user/simplelogin:25/messages/E0001/4500017496
        //step 2, 由于存在一个PO存在于多个release group内的情况,将02_PU更新到step1里对应'data/release_group'时，要查重
        //step 3, 将 Server User 100001的Event/E0001/100001/02_PU/PO_ITEMS/4500017496更新到step1里对应的'items';
        //        当items>5,多余部分更新到step1里对应的'moreitems'
        //step 4, 把对应的Components节点进行更新
        self.usermappingRef.child(ServeruserId).once('value', function(snap) {

            if (snap.child(self.path.usermapping_FBuser_field).exists()) {

                FBuserId = snap.child(self.path.usermapping_FBuser_field).val();

                UserMessageRef = self.userRootRef.child(FBuserId)
                    .child(self.path.user_message_field).child(self.event);

                insertE0001Message();

                updateComponents();
            }


            function insertE0001Message() {

                self.ref.child(ServeruserId).once('value', function(snap) {
                    snap.forEach(function(childsnap) {
                        //here childsnap is release group, e.g., 02_PU
                        var groupId = childsnap.key();
                        var groupRef = childsnap.ref();

                        childsnap.child('PO_HEADERS')
                            .forEach(function(POHeader_childsnap) {

                                var POId = POHeader_childsnap.key();
                                var POHRefStr = groupRef.child('PO_HEADERS').child(POId).toString();
                                var POIRefStr = groupRef.child('PO_ITEMS').child(POId).toString();
                                var metadata={
                                        'rel_GROUP': POHeader_childsnap.child('rel_GROUP').val(),
                                        'doc_DATE': POHeader_childsnap.child('doc_DATE').val(),
                                        'target_VAL': POHeader_childsnap.child('target_VAL').val()
                                    };
                                
                                var HeadData = {
                                    "data": {
                                        "date": POHeader_childsnap.child('doc_DATE').val(),
                                        "favorite": false,
                                        "serverUserid": ServeruserId,
                                        "id": POId,
                                        "component": self.event,
                                        "read": false,
                                        "visible": true,
                                        'release_group': groupId,
                                        'HeadRef': POHRefStr.substring(rootRefStr.length + 1, POHRefStr.length),
                                        'ItemRef': POIRefStr.substring(rootRefStr.length + 1, POIRefStr.length),
                                        'metadata':metadata
                                    }
                                };
                                //in users/simplelogin%3A25/messages/E0001/02_PU/4500017496 insert message数据
                                var po_ref = self.userRootRef.child(FBuserId)
                                                .child(self.path.user_message_field).child(self.event).child(POId);
                                po_ref.transaction(function(currentData) {
                                    if (currentData === null ) {
                                        return HeadData;
                                    }
                                    else {
                                        
                                        //存在一个PO存在于多个release group内的情况
                                        po_ref.child('data/release_group').once('value', function(nameSnapshot) {
                                          var release_groupStr = nameSnapshot.val();
                                          var release_groupSubstr = HeadData.data.release_group;
                                          console.log(POId+' '+release_groupStr+'  '+release_groupSubstr);
                                          if(!release_groupStr.search(release_groupSubstr)){
                                              release_groupStr = release_groupStr +'||'+ HeadData.data.release_group;                                              
                                          }

                                          po_ref.child('data/release_group').set(release_groupStr); 
                                        });
                                        
                                        return; // Abort the transaction.
                                    }
                                });

                                groupRef.child('PO_ITEMS').child(POId)
                                    .once('value', function(snap) {
                                        var n = 0;
                                        snap.forEach(function(childsnap) {
                                            n++;
                                            var itemID = childsnap.key();

                                            var itemData = {
                                                'net_PRICE': childsnap.child('net_PRICE').val(),
                                                'plant': childsnap.child('plant').val(),
                                                'disp_QUAN': childsnap.child('disp_QUAN').val(),
                                            };
                                            if (n < 6) {
                                                po_ref.child('items').child(itemID).set(itemData);
                                            }
                                            else {
                                                po_ref.child('moreItems').child(itemID).set(itemData);
                                            }
                                        });
                                    });
                            });
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
                                 messageArray[childsnap.key()]=childsnap.child('data/date').val();
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
    // deleteMessage: function(key) {
    //     var self = this;
    //     var ServeruserId = key;
    //     var FBuserId, UserMessageRef;
    //     var rootRefStr = self.rootRef.toString();

    //     //当 Server User 100001的Event/E0001/100001/02_PU/PO_HEADERS/4500017496被删除
    //     //对应的删除FB User simplelogin:25下面user/simplelogin:25/messages/E0001/02_PU/4500017496
    //     //中间要利用UserList/100001/FBUser:simplelogin:25进行User映射

    //     self.usermappingRef.child(ServeruserId).once('value', function(snap) {
    //         FBuserId = snap.child('FBUser').val();
    //         UserMessageRef = self.userRootRef.child(FBuserId).child('messages/E0001');

    //         UserMessageRef.once('value', function(snap) {
    //             snap.forEach(function(childsnap) {

    //                 var groupId = childsnap.key();
    //                 var groupRef = childsnap.ref();

    //                 childsnap.forEach(function(PO_childsnap) {
    //                     var User_PORef = PO_childsnap.ref();
    //                     var POHUrl = PO_childsnap.child('POHRef').val();
    //                     var POHRef = self.ref.root().child(POHUrl);

    //                     POHRef.once('value', function(snap) {

    //                         var POexist = snap.exists();

    //                         //删除对应的message数据
    //                         var onComplete = function(error) {
    //                             if (error) {
    //                                 console.log('Synchronization failed');
    //                             }
    //                             else {
    //                                 console.log(POHUrl, 'Synchronization succeeded');
    //                             }
    //                         };

    //                         if (POexist === false) {
    //                             User_PORef.remove(onComplete);
    //                         }


    //                     });
    //                 });
    //             });
    //         });
    //     });



    // },
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
        new E0001Monitor(firebaseUrl, pathProps);
    });
    if (dynamicPathUrl) {
        console.log('dynamicPathUrl'.green, dynamicPathUrl);
        new DynamicE0001Monitor(fbutil.fbRef(firebaseUrl, dynamicPathUrl), function(pathProps) {
            return new E0001Monitor(firebaseUrl, pathProps);
        });
    }
};
