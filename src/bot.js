'use strict';

module.exports.setup = function (app) {
    var builder = require('botbuilder');
    var teams = require('botbuilder-teams');
    var config = require('config');
    var BOT_ID = "5786f949-4443-4fb5-bfca-f616654bb656@cGoLJ7dU20g";
    var memberIdList = [];

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
        appPassword: config.get("bot.appPassword")
    });

    var inMemoryBotStorage = new builder.MemoryBotStorage();

    // Define a simple bot with the above connector that echoes what it received
    var bot = new builder.UniversalBot(connector, function (session) {
        // Message might contain @mentions which we would like to strip off in the response
        var text = teams.TeamsMessage.getTextWithoutMentions(session.message);
        console.log(text);
        session.send('You said: %s', text);

        //Fetching members - 
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
                    console.log("Member id list from teams " + memberIdList);
                    var splitList = spitMembers();
                    for(var i = 0; i < splitList.length; i++) {
                        var chatMembers = splitList[i];
                        var membersPayLoad;
                        for(var j = 0; j < chatMembers.length; j++) {
                            var memberPayLoad = {
                                id: chatMembers[j].id,
                                name: chatMembers[i].name
                            }
                            membersPayLoad.push(memberPayLoad)
                            //TODO: Call group chats method here
                        }
                    }
                }
            }
        );

    }).set('storage', inMemoryBotStorage);

    // Setup an endpoint on the router for the bot to listen.
    // NOTE: This endpoint cannot be changed and must be api/messages
    app.post('/api/messages', connector.listen());

    bot.on('conversationUpdate', function (message) {
        console.log(message);
        // var event = teams.TeamsMessage.getConversationUpdateData(message);         //Check if the member added is the BOT  
        var members = message.membersAdded;
        memberIdList.push(members)

        var deletedMembers = message.membersRemoved;


        // Loop through all members that were just added to the team
        for (var i = 0; i < members.length; i++) {
            // See if the member added was our bot
            if (members[i].id.includes(BOT_ID)) {
                var botmessage = new builder.Message()
                    .address(message.address)
                    .text('Hello, Donut Bot was added to your Team');

                bot.send(botmessage, function (err) { });
            }
        }

        for (var i = 0; i < deletedMembers.length; i++) {
            if (memberIdList[i].id === deletedMembers[i].id) {
                memberIdList.splice(i,1)
            }
            // See if the member deletd was our bot
            if (members[i].id.includes(BOT_ID)) {
                //TODO: Clear the timer if the bot is removed.
            }
        }
    });

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
