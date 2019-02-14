'use strict';

module.exports.setup = function(app) {
    var builder = require('botbuilder');
    var teams = require('botbuilder-teams');
    var config = require('config');
    var memberList = undefined;

    if (!config.has("bot.appId")) {
        // We are running locally; fix up the location of the config directory and re-intialize config
        process.env.NODE_CONFIG_DIR = "../config";
        delete require.cache[require.resolve('config')];
        config = require('config');
    }

    // Create a connector to handle the conversations
    var connector = new teams.TeamsChatConnector({
        // It is a bad idea to store secrets in config files. We try to read the settings from
        // the config file (/config/default.json) OR then environment variables.
        // See node config module (https://www.npmjs.com/package/config) on how to create config files for your Node.js environment.
        appId: config.get("bot.appId"),
        appPassword: config.get("bot.appPassword"),
        appName: config.get("bot.appName")
    });
    
    var inMemoryBotStorage = new builder.MemoryBotStorage();
    
    // ****************** Bot Setup ****************** //

    // Define a simple bot with the above connector that echoes what it received
    var bot = new builder.UniversalBot(connector, function(session) {
        // Message might contain @mentions which we would like to strip off in the response
        var text = teams.TeamsMessage.getTextWithoutMentions(session.message);
        session.send('You said: %s', text);
        var fetchMembers = function() {
            // start fetch members dialog
            if (memberList === undefined) {
                session.beginDialog('FetchMemberList')
            }
        };
        // we should fetch members every 2 weeks
        fetchMembers();
        //setInterval(fetchMembers, 1500); // 2 weeks is 1209600
    }).set('storage', inMemoryBotStorage);
 
    // ****************** Messaging ****************** //

    // Setup an endpoint on the router for the bot to listen.
    // NOTE: This endpoint cannot be changed and must be api/messages
    app.post('/api/messages', connector.listen());

    // ****************** Events ****************** //

    bot.on('conversationUpdate', function (message) {
        console.log(message);   
        var event = teams.TeamsMessage.getConversationUpdateData(message);   
    });

    // ****************** Dialogs ****************** //

    bot.dialog('MentionUser', function (session, userId, userName) {
        // user name/user id
        var user = {
            id: userId,
            name: userName
        };
        var mention = new teams.UserMention(user);
        var msg = new teams.TeamsMessage(session).addEntity(mention).text(mention.text + ' ' + teams.TeamsMessage.getTenantId(session.message));
        session.send(msg);
        session.endDialog();
    });

    bot.dialog('FetchMemberList', function (session) {
        var conversationId = session.message.address.conversation.id;
        connector.fetchMembers(session.message.address.serviceUrl, conversationId, function (err, result) {
            if (err || result.length == 0) {
                session.endDialog('There is some error');
            }
            else {
                // now that we have the members, let's pair them up
                // the way this works temporarily for now is:
                // Create two arrays with the names, shuffle them, and make sure you don't pick the same name from both arrays
                var splitAt = function(i, xs) {
                    var a = xs.slice(0, i);
                    var b = xs.slice(i, xs.length);
                    return [a, b];
                };
                    
                var shuffle = function(xs) {
                    return xs.slice(0).sort(function() {
                        return .5 - Math.random();
                    });
                };
                    
                var zip = function(xs) {
                    return xs[0].map(function(_,i) {
                        return xs.map(function(x) {
                        return x[i];
                        });
                    });
                }
                var people = result
                var lastPerson = undefined;
                if (people.length % 2 != 0) {
                    lastPerson = people[people.length-1];
                    people.pop()
                } 

                var finalRes = zip(splitAt(people.length/2, shuffle(people)));
                if (lastPerson !== undefined && finalRes.length > 0){
                    finalRes[finalRes.length-1].push(lastPerson)
                }

                memberList = finalRes;
                
                // now go through the list of people and start 1 one 1 chats with them
                for (var i = 0; i < finalRes.length; i++){
                    var members = [];
                    for (var j = 0; j < finalRes[i].length; j++){
                        var user = {
                            id: finalRes[i][j].id,
                            name: finalRes[i][j].name
                        }
                        members.push(user)
                    }
                    session.beginDialog('StartNew1on1Chat', members),
                    function(session, results){
                        console.log(results)
                    }
                } 
                session.endDialog();
                // session.endDialog('%s', JSON.stringify(finalRes));
            }
        });
    });

    bot.dialog('StartNew1on1Chat', function (session, users) {
        var address = {
            members: users,
            user: {},
            topicName: 'Your donut body',
            isGroup: true,
            bot: {
                id: 'c57df800-a739-436e-beaa-d509dc0de6b0',
                name: 'Donut-Yaz'
            },
            serviceUrl: "https://smba.trafficmanager.net/apis",
            useAuth: true
        };
        bot.beginDialog(address, '/');
    });
    // Export the connector for any downstream integration - e.g. registering a messaging extension
    module.exports.connector = connector;
};
