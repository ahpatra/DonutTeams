'use strict';

module.exports.setup = function (app) {
    var builder = require('botbuilder');
    var teams = require('botbuilder-teams');
    var config = require('config');
    var BOT_ID = "";
    var memberIdList = [];
    var membersPayLoad =[];
    var scheduleFollowUpTimer = true;
    var address;
    var CHAT_MEMBER = undefined;
    var PAIRINGS = {};

    if (!config.has("bot.appId")) {
        // We are running locally; fix up the location of the config directory and re-intialize config
        process.env.NODE_CONFIG_DIR = "../config";
        delete require.cache[require.resolve('config')];
        config = require('config');
    }
    BOT_ID = config.get("bot.appId");
    // Create a connector to handle the conversations
    var connector = new teams.TeamsChatConnector({
        // It is a bad idea to store secrets in config files. We try to read the settings from
        // the config file (/config/default.json) OR then environment variables.
        // See node config module (https://www.npmjs.com/package/config) on how to create config files for your Node.js environment.
        appId: config.get("bot.appId"),
        appPassword: config.get("bot.appPassword")
    });

    var inMemoryBotStorage = new builder.MemoryBotStorage();

    // Define a simple bot with the above connector that echoes what it received
    var bot = new builder.UniversalBot(connector, function (session) {
        // Message might contain @mentions which we would like to strip off in the response
        // var text = teams.TeamsMessage.getTextWithoutMentions(session.message);
        // console.log(text);

        //Fetching members - 
        if (membersPayLoad.length == 0){
            var conversationId = session.message.address.conversation.id;
            connector.fetchMembers(session.message.address.serviceUrl,
                conversationId,
                (err, result) => {
                    if (err) {
                        console.log('Member fetch error :' + err);
                    }
                    else {
                        for (var i = 0; i < result.length; i++) {
                            memberIdList.push(result[i]);
                        }
                        startGroupChatScheduleFunc(session);
                        console.log("Member id list from teams " + memberIdList);
                        //session.endDialog();
                    }
                }
            );
        }
        
        session.beginDialog('sendGreeting');
    }).set('storage', inMemoryBotStorage);

    // Setup an endpoint on the router for the bot to listen.
    // NOTE: This endpoint cannot be changed and must be api/messages
    app.post('/api/messages', connector.listen());

    bot.on('conversationUpdate', function (message) {
        console.log(message);
        // var event = teams.TeamsMessage.getConversationUpdateData(message);         //Check if the member added is the BOT  
        var members = message.membersAdded;

        var deletedMembers = message.membersRemoved;

        if (typeof members != "undefined") {
            memberIdList.push(members)
            // Loop through all members that were just added to the team
            for (var i = 0; i < members.length; i++) {
                // See if the member added was our bot
                if (members[i].id.includes(BOT_ID)) {
                    address = message.address;
                    var botmessage = new builder.Message()
                        .address(message.address)
                        .text('Hello, Donut Bot was added to your Team');
                    console.log("donut added");
                    bot.send(botmessage, function (err) { });
                    //start scheduling of Group chat - set to 5 seconds for debug
                    //setInterval(startGroupChatScheduleFunc, 5000 * 24);
                }
            }
        }
        if (typeof deletedMembers != "undefined") {

            for (var i = 0; i < deletedMembers.length; i++) {
                if (memberIdList[i].id === deletedMembers[i].id) {
                    memberIdList.splice(i, 1)
                }
                // See if the member deleted was our bot
                if (deletedMembers[i].id.includes(BOT_ID)) {
                    //TODO: Clear the timer if the bot is removed.
                    console.log("Donut deleted");
                    clearInterval(this);
                    clearInterval(this);
                }
            }
        }
    });

    function insertOrAdd(member, list, i){
        var newArr = [];
        for (var x = 0; x < list.length; x++){
            newArr.push(list[x].name);
        }
        newArr.splice(i, 1);
        PAIRINGS[member.name] = newArr;
    }

    function createChatMembersPayload() {
        var splitList = spitMembers();
        for (var i = 0; i < splitList.length; i++) {
            var chatMembers = splitList[i];
            for (var j = 0; j < chatMembers.length; j++) {
                var memberPayLoad = {
                    id: chatMembers[j].id,
                    name: chatMembers[j].name
                }
                membersPayLoad.push(memberPayLoad)
                insertOrAdd(chatMembers[j], chatMembers, j);
            }
        }
    }

    function startGroupChatScheduleFunc(session) {
        createChatMembersPayload()
        createGroupChats(session, membersPayLoad)
        

        // if (scheduleFollowUpTimer) {
        //     setInterval(startFollowUpChatScheduleFunc, 4500 * 24);
        //     scheduleFollowUpTimer = false;
        // }
    }

    function startFollowUpChatScheduleFunc() {
        createGroupChats(membersPayLoad)
        var botmessage = new builder.Message()
            .address(address)
            .text('Hello, this is a reminder for your Donut');
        bot.send(botmessage, function (err) { });
    }

    bot.dialog('startChat', function(session) {
            var address =
            {
                channelId: 'msteams',
                user: { id: CHAT_MEMBER.id },
                channelData: {
                    tenant: {
                        id: '72f988bf-86f1-41af-91ab-2d7cd011db47'
                    }
                },
                bot:
                {
                    id: config.get("bot.appId"),
                    name: config.get("bot.appName")
                },
                serviceUrl: session.message.address.serviceUrl,
                useAuth: true
            }
            var x = PAIRINGS;
            bot.beginDialog(address, 'sendGreeting');
            //bot.beginDialog(address, '/');
        });

    bot.dialog('sendGreeting', function(session){
        var card = require("./views/greetingCard.json");
        var botmessage = new builder.Message(session)
            .address(session.message.address)
            .addAttachment({
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": card
            });
            
        // session.send(botmessage);
        bot.send(botmessage, function (err) { });
        //session.endDialog();
    });

    function createGroupChats(session, chatMembers) {
        for (var i = 0; i < chatMembers.length; i++) {
            CHAT_MEMBER = chatMembers[i];
            session.beginDialog('startChat', session)
         }
    }

    function spitMembers() {
        // randomize member ids
        var j, temp, i;
        for (i = memberIdList.length - 1; i > 0; i--) {
            j = Math.floor(Math.random() * (i + 1));
            temp = memberIdList[i];
            memberIdList[i] = memberIdList[j];
            memberIdList[j] = temp;
        }
        console.log("Randomized id list " + memberIdList);

        //split into lists of 2 
        var splitMemberIdList = [];

        for (var i = 0; i < memberIdList.length; i += 2) {
            splitMemberIdList.push(memberIdList.slice(i, i + 2));
        }

        console.log("Split list Before concat " + splitMemberIdList)

        //if there are odd number of members, last list has 3 ppl
        if (memberIdList.length % 2 == 1) {
            splitMemberIdList[splitMemberIdList.length - 2].push(splitMemberIdList[splitMemberIdList.length - 1][0]);
            splitMemberIdList.pop()
            console.log("Split list After concat " + splitMemberIdList);
        }
        return splitMemberIdList
    }

    // Export the connector for any downstream integration - e.g. registering a messaging extension
    module.exports.connector = connector;
}
