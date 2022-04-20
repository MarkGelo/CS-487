// database management
const { MongoClient } = require('mongodb')
//const mongoose = require('mongoose');
const dbURI = 'mongodb+srv://cs487:3cr4obmkytL8A8xF@cluster0.2916t.mongodb.net/forum'
const client = new MongoClient(dbURI);
// username: cs487
// password: 3cr4obmkytL8A8xF

// User attributes
// username, password, university, status (student, alumni, staff, prof, etc.), bio (biography), tags (music, soccer, math, etc.), joinedAt (automatically created)
// String, String, String, String, String, Array, timestamp
// username is unique

//await client.db('forum').collection('users').createIndex({username: 1}, {unique: true});

// Messages attributes
// user1, user2, subject, user1unread, user2unread, updatedAt, msgs
// string, string, string, int, int, date, array
// user1, user2, subject together are unique
// array msgs are [{sender: "", content: "", timestamp: ""}]

// await client.db('forum').collection('messages').createIndex({user1: 1, user2: 1, subject: 1}, {unique: true})

// Post attributes
// _id, poster, title, content, tags, image_link, subscribers, createdAt
// id, string, string, string, array, string, array, date
// _id is unique and the one u use to reference a post

async function addUser(username, password){
    await client.db('forum').collection('users').insertOne({username: username, password: password, joinedAt: new Date()})
        .then((res) => console.log('Added %s to db', username))
        .catch((err) => console.log(err));
}

// updates is dictionary of what u want to update
// {university = 'IIT', password = '1234'} or {tags = ['Games', 'Art']} etc. 
async function updateUser(username, updates){
    await client.db('forum').collection('users').updateOne({username: username}, {$set: updates})
        .then((res) => console.log('%s updated', username))
        .catch((err) => console.log(err));
}

async function getUsers(){
    const users = await client.db('forum').collection('users').find({}).toArray()
    return users;
}

async function getUser(username){
    const result = await client.db('forum').collection('users').findOne({username: username})
    return result;
}

// aggregate messages with titles and amount unread - sorted by date
async function getAllMessages(username){
    const MSGS = await client.db('forum').collection('messages').find({$or: [{user1: username}, {user2: username}]}).sort({updatedAt: -1}).toArray();
    //console.log(MSGS);
    return MSGS;
}

//read messages, remove unread #
//when user clicks on a message chat
async function readMessages(username, subject, receiver){
    const MSG = await client.db('forum').collection('messages').findOne({user1: {$in: [username, receiver]}, user2: {$in: [username, receiver]}, subject: subject});
    if (MSG == null){
        console.log('chat not found');
        return null; // not found
    }else{
        console.log('found chat');
        const updates = {user1unread: (username == MSG.user1) ? 0 : MSG.user1unread, 
            user2unread: (username == MSG.user2) ? 0 : MSG.user2unread}
        await client.db('forum').collection('messages').updateOne({user1: MSG.user1, user2: MSG.user2}, {$set: updates})
            .then((res) => console.log('chat read'))
            .catch((err) => console.log(err));
    }
    //console.log(MSG)
    return MSG;
}

async function sendMessage(username, subject, content, receiver){
    //check if already message document in db, if not, make one
    const MSG = await client.db('forum').collection('messages').findOne({user1: {$in: [username, receiver]}, user2: {$in: [username, receiver]}, subject: subject});
    if (MSG == null){
        await client.db('forum').collection('messages').insertOne({user1: username, user2: receiver, subject: subject,
                                                                user1unread: 0, user2unread: 1, updatedAt: new Date(),
                                                                msgs: [{sender: username, content: content, timestamp: new Date()}]})
            .then((res) => console.log('Added msg'))
            .catch((err) => console.log(err));
    }else{
        //console.log('Found previous chat');
        const updates = {updatedAt: new Date(), user1unread: (username == MSG.user1) ? MSG.user1unread : MSG.user1unread + 1, 
                        user2unread: (username == MSG.user2) ? MSG.user2unread : MSG.user2unread + 1}
        await client.db('forum').collection('messages').updateOne({user1: MSG.user1, user2: MSG.user2}, {$set: updates})
            .then((res) => console.log('chat stats updated'))
            .catch((err) => console.log(err));
        await client.db('forum').collection('messages').updateOne({user1: MSG.user1, user2: MSG.user2}, 
                                                                {$push: {msgs: {sender: username, content: content, timestamp: new Date()}}})
            .then((res) => console.log('chat updated'))
            .catch((err) => console.log(err));
    }
}

async function addPost(username, title, content, tags, image_link){
    await client.db('forum').collection('posts').insertOne({poster: username, title: title, content: content, tags: tags, image_link: image_link, 
                                                            subscribers: [], createdAt: new Date()})
        .then((res) => console.log('Added forum post'))
        .catch((err) => console.log(err));
}

async function viewPost(post_id){
    const res = await client.db('forum').collection('posts').findOne({_id: post_id});
    return res;
}

async function subscribeToPost(username, post_id){
    await client.db('forum').collection('posts').updateOne({_id: post_id}, {$push: {subscribers: username}})
        .then((res) => console.log('%s subscribed to post %s', username, post_id))
        .catch((err) => console.log(err));
}

//returns posts that users are subscribed to
async function subscribedPosts(username){
    const subPosts = await client.db('forum').collection('posts').find({subscribers: username}).sort({createdAt: -1}).toArray();

    return subPosts;
}

//return recommended posts based on tags of user and tags of post
async function recommendedPosts(username){
    const USER = await client.db('forum').collection('users').findOne({username: username})
    const REC = await client.db('forum').collection('posts').find({tags: {$in: USER.tags}}).sort({createdAt: -1}).toArray();

    // added field "recommendedReason" -- same tags
    for(var i = 0; i < REC.length; i++){
        REC[i].recommendedReason = REC[i].tags.filter(function(val) {
            return USER.tags.indexOf(val) != -1;
        });
    }

    return REC
}

// simple search of keywords in title, content, and tags and users too -- case insensitive
// if empty query, return all posts sorted by date
async function searchPosts(query){
    if(query == ''){
        const ret = await client.db('forum').collection('posts').find({}).sort({createdAt: -1}).toArray();
        return ret;
    }else{
        const ret = await client.db('forum').collection('posts').find({$or: [{content: {$regex: new RegExp(query, "i")}}, {title: {$regex: new RegExp(query, "i")}}, 
                                                                        {tags: new RegExp(query, "i")}, 
                                                                        {poster: {$regex: new RegExp(query, "i")}}]}).sort({createdAt: -1}).toArray();
        return ret;
    }
}

// updates is dictionary of what u want to update
async function editPost(post_id, updates){
    await client.db('forum').collection('posts').updateOne({_id: post_id}, {$set: updates})
        .then((res) => console.log('post updated'))
        .catch((err) => console.log(err));
}

async function deletePost(post_id){
    await client.db('forum').collection('posts').deleteOne({_id: post_id})
        .then((res) => console.log('post deleted'))
        .catch((err) => console.log(err));
}

async function main(){
    await client.connect().then((res) => console.log('connect to db'))
        .catch((err) => console.log(err))

    // testing
    const searchedPosts = await searchPosts('video games');
    console.log(searchedPosts)

    await client.close();
}

main().catch(console.error);

/* Forum Posts examples
    await addPost('prof@hawk.iit.edu', 'How to get a C', 
    'Do homework and try on the exams, ez. This applies to all types of classes, math, computer science, art, history, etc. \n zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
    ['Math', 'Computer Science', 'Art'], 
    'https://img.rawpixel.com/s3fs-private/rawpixel_images/website_content/wk44388207-image-kp6bxuug.jpg?w=800&dpr=1&fit=default&crop=default&q=65&vib=3&con=3&usm=15&bg=F4F4F3&ixlib=js-2.2.1&s=8936f37a064f2187b7f47e666197bc9e')

    await addPost('staff@hawk.iit.edu', 'vitae elementum curabitur vitae',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Sagittis eu volutpat odio facilisis mauris sit amet massa. Feugiat nibh sed pulvinar proin gravida hendrerit lectus. Id interdum velit laoreet id donec ultrices. Mauris a diam maecenas sed enim. Id leo in vitae turpis massa sed elementum tempus egestas. Tristique senectus et netus et malesuada. Purus viverra accumsan in nisl nisi scelerisque. Feugiat scelerisque varius morbi enim nunc faucibus a pellentesque. Eget magna fermentum iaculis eu non diam phasellus vestibulum lorem. Senectus et netus et malesuada fames ac. Et netus et malesuada fames ac. Venenatis tellus in metus vulputate.\nFringilla phasellus faucibus scelerisque eleifend donec pretium vulputate sapien. Risus nullam eget felis eget nunc lobortis mattis. Sed libero enim sed faucibus turpis in eu mi bibendum. At urna condimentum mattis pellentesque id nibh tortor id. Non tellus orci ac auctor augue. Feugiat sed lectus vestibulum mattis ullamcorper velit sed ullamcorper. Dignissim suspendisse in est ante in nibh mauris cursus. A condimentum vitae sapien pellentesque habitant morbi tristique. Sem nulla pharetra diam sit amet nisl suscipit. Dolor sit amet consectetur adipiscing elit ut aliquam purus. Orci dapibus ultrices in iaculis nunc. Et ligula ullamcorper malesuada proin libero nunc. Quam id leo in vitae turpis massa sed.',
    ['Video Games', 'Soccer', 'English'], 'https://assets.justinmind.com/wp-content/uploads/2018/11/Lorem-Ipsum-alternatives-768x492.png')

    await addPost('student1@hawk.iit.edu', 'curabitur vitae',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Sagittis eu volutpat odio facilisis mauris sit amet massa. Feugiat nibh sed pulvinar proin gravida hendrerit lectus. Id interdum velit laoreet id donec ultrices. Mauris a diam maecenas sed enim. Id leo in vitae turpis massa sed elementum tempus egestas. Tristique senectus et netus et malesuada. Purus viverra accumsan in nisl nisi scelerisque. Feugiat scelerisque varius morbi enim nunc faucibus a pellentesque. Eget magna fermentum iaculis eu non diam phasellus vestibulum lorem. Senectus et netus et malesuada fames ac. Et netus et malesuada fames ac. Venenatis tellus in metus vulputate.',
    ['English'], 'https://assets.justinmind.com/wp-content/uploads/2018/11/Lorem-Ipsum-alternatives-768x492.png')

    await addPost('mgameng1@hawk.iit.edu', 'Blah blah blah blah',
    'Blah blah blah blah Blah blah blah blah Blah blah blah blah Blah blah blah blah Blah blah blah blah Blah blah blah blah',
    [], '')

    const res = await recommendedPosts('mgameng1@hawk.iit.edu');
    console.log(res);
    const post = await viewPost(res[0]._id);
    console.log(post);
    await subscribeToPost('mgameng1@hawk.iit.edu', post._id);
    const subPost = await subscribedPosts('mgameng1@hawk.iit.edu');
    console.log(subPost);
    const searchedPosts = await searchPosts('staff@hawk.iit.edu');
    const searchedPosts = await searchPosts('elementum');
    const searchedPosts = await searchPosts('ipsum');
    const searchedPosts = await searchPosts('video games');
    const searchedPosts = await searchPosts('soccer');
    console.log(searchedPosts);

    const searchedPosts = await searchPosts(''); // get all posts
    console.log(searchedPosts.length)
*/

/* MSG FUNCTION EXAMPLES
    await sendMessage('mgameng1@hawk.iit.edu', 'What is this?', 'hmmm', 'prof@hawk.iit.edu');
    await sendMessage('mgameng1@hawk.iit.edu', 'What is this?', 'Hello there.', 'prof@hawk.iit.edu');

    const msgs = await readMessages('prof@hawk.iit.edu', 'What is this?', 'mgameng1@hawk.iit.edu');
    console.log(msgs);

    await sendMessage('prof@hawk.iit.edu', 'What is this?', 'Hi, whats up?', 'mgameng1@hawk.iit.edu');
    
    const msgs = await readMessages('mgameng1@hawk.iit.edu', 'What is this?', 'prof@hawk.iit.edu');
    console.log(msgs);

    await sendMessage('mgameng1@hawk.iit.edu', 'What is this?', 'Nothing', 'prof@hawk.iit.edu');

    await sendMessage('student1@hawk.iit.edu', 'Study group?', 'yo, this class ...', 'mgameng1@hawk.iit.edu');
    const msgs = await readMessages('mgameng1@hawk.iit.edu', 'Study group?', 'student1@hawk.iit.edu');
    console.log(msgs);
    await sendMessage('mgameng1@hawk.iit.edu', 'Study group?', 'im down', 'student1@hawk.iit.edu');
    const msgs = await readMessages('student1@hawk.iit.edu', 'Study group?', 'mgameng1@hawk.iit.edu');
    console.log(msgs);
    console.log(msgs.msgs[0].content);

    const allMSGS = await getAllMessages('mgameng1@hawk.iit.edu');
    console.log(allMSGS);
*/

/* USER FUNCTION EXAMPLES
    await addUser('mgameng1@hawk.iit.edu', 'password123');

    await updateUser('mgameng1@hawk.iit.edu', {password: '1234', tags: ['Art', 'Video Games', 'Soccer', 'Basketball', 'Math']});

    await updateUser('mgameng1@hawk.iit.edu', {university: 'Illinois Institute of Technology', status: 'Student', bio: 'Hello, my name is Mark.'});

    const user = await getUser('mgameng1@hawk.iit.edu');
    console.log(user);
    console.log(user.joinedAt);

    await addUser('staff@hawk.iit.edu', 'staffpwd');
    await updateUser('staff@hawk.iit.edu', 
        {university: 'Illinois Institute of Technology', status: 'Staff', bio: 'Hello, I am a staff.',
        tags: ['Soccer', 'English']});

    await addUser('prof@hawk.iit.edu', 'profpwd');
    await updateUser('prof@hawk.iit.edu', 
        {university: 'Illinois Institute of Technology', status: 'Professor', bio: 'Hello, I am a professor.',
        tags: ['Computer Science', 'Art', 'Soccer']});

    await addUser('student1@hawk.iit.edu', 'profpwd');
    await updateUser('student1@hawk.iit.edu', 
        {university: 'Northwestern University', status: 'Student', bio: 'Hello, I am a student at Northwestern.',
        tags: ['Math', 'Art', 'Soccer']});
*/