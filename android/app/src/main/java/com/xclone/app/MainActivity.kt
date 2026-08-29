package com.testagram.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.PersonOutline
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { TestagramApp() }
    }
}

private data class NavDestination(
    val label: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector
)

@Composable
private fun TestagramApp() {
    val destinations = listOf(
        NavDestination("Home", Icons.Default.Home),
        NavDestination("Explore", Icons.Default.Search),
        NavDestination("Notifications", Icons.Default.NotificationsNone),
        NavDestination("Messages", Icons.Default.MailOutline),
        NavDestination("Profile", Icons.Default.PersonOutline)
    )
    var selected by remember { mutableIntStateOf(0) }
    var showComposer by remember { mutableIntStateOf(0) }

    MaterialTheme {
        Scaffold(
            topBar = {
                AppTopBar(
                    title = destinations[selected].label,
                    onSearch = { selected = 1 }
                )
            },
            bottomBar = {
                NavigationBar(modifier = Modifier.navigationBarsPadding()) {
                    destinations.forEachIndexed { index, destination ->
                        NavigationBarItem(
                            selected = selected == index,
                            onClick = { selected = index },
                            icon = { Icon(destination.icon, contentDescription = destination.label) },
                            label = { Text(destination.label) }
                        )
                    }
                }
            },
            floatingActionButton = {
                FloatingActionButton(onClick = { showComposer = 1 }) {
                    Icon(Icons.Default.Add, contentDescription = "Create post")
                }
            }
        ) { padding ->
            Surface(modifier = Modifier.fillMaxSize().padding(padding)) {
                when (selected) {
                    0 -> HomeScreen()
                    1 -> ExploreScreen()
                    2 -> NotificationsScreen()
                    3 -> MessagesScreen()
                    else -> ProfileScreen()
                }
            }
        }

        if (showComposer == 1) {
            CreatePostSheet(onDismiss = { showComposer = 0 })
        }
    }
}

@Composable
private fun AppTopBar(title: String, onSearch: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text("Testagram", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            IconButton(onClick = onSearch) {
                Icon(Icons.Default.Search, contentDescription = "Search")
            }
        }
    }
}

@Composable
private fun HomeScreen() {
    val posts = listOf(
        Post("Testagram", "@testagram", "Welcome to Testagram. Stay connected with your community."),
        Post("Testagram", "@testagram", "Explore conversations and discover creators."),
        Post("Testagram", "@testagram", "Share your thoughts, photos and videos with your followers.")
    )
    LazyColumn(modifier = Modifier.fillMaxSize()) {
        item { SectionTitle("For you") }
        items(posts) { PostCard(it) }
    }
}

@Composable
private fun ExploreScreen() {
    LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        item { SectionTitle("Explore") }
        item { SearchCard() }
        item { SectionTitle("Trending") }
        items(listOf("#Testagram", "Creators", "Technology", "Photography", "Communities")) { topic ->
            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
                Column {
                    Text("Trending on Testagram", style = MaterialTheme.typography.bodySmall)
                    Text(topic, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun NotificationsScreen() {
    val notifications = listOf(
        "Your post received a new like.",
        "A creator you follow posted something new.",
        "You have a new community invitation."
    )
    LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        item { SectionTitle("Notifications") }
        items(notifications) { message ->
            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar()
                Spacer(Modifier.size(12.dp))
                Text(message)
            }
        }
    }
}

@Composable
private fun MessagesScreen() {
    val conversations = listOf("Testagram Support", "Creator Community", "New follower")
    LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        item { SectionTitle("Messages") }
        items(conversations) { conversation ->
            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar()
                Spacer(Modifier.size(12.dp))
                Column {
                    Text(conversation, fontWeight = FontWeight.SemiBold)
                    Text("Open conversation", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun ProfileScreen() {
    LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
        item {
            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(size = 72.dp)
                Spacer(Modifier.size(16.dp))
                Column {
                    Text("Testagram", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("@testagram", style = MaterialTheme.typography.bodyMedium)
                    Text("0 followers · 0 following", style = MaterialTheme.typography.bodySmall)
                }
            }
            SectionTitle("Posts")
        }
        items(listOf("Your posts will appear here.", "Build your profile and connect with people.")) { text ->
            Text(text, modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp))
        }
    }
}

@Composable
private fun CreatePostSheet(onDismiss: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxSize().padding(top = 80.dp),
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
        tonalElevation = 8.dp
    ) {
        Column(modifier = Modifier.fillMaxSize().padding(20.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Create post", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("Close", modifier = Modifier.padding(8.dp))
            }
            Spacer(Modifier.height(24.dp))
            Text("What's happening?", style = MaterialTheme.typography.bodyLarge)
            Spacer(Modifier.height(16.dp))
            Text("Media attachment and publishing are ready for the next native integration layer.", style = MaterialTheme.typography.bodyMedium)
        }
    }
}

private data class Post(val author: String, val handle: String, val body: String)

@Composable
private fun PostCard(post: Post) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(16.dp)).background(Color(0xFFF5F5F5)).padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar()
            Spacer(Modifier.size(10.dp))
            Column {
                Text(post.author, fontWeight = FontWeight.SemiBold)
                Text(post.handle, style = MaterialTheme.typography.bodySmall)
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(post.body, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun Avatar(size: androidx.compose.ui.unit.Dp = 40.dp) {
    Box(Modifier.size(size).clip(CircleShape).background(Color(0xFFDDDDDD)))
}

@Composable
private fun SearchCard() {
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Color(0xFFF5F5F5)).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Default.Search, contentDescription = "Search")
        Spacer(Modifier.size(10.dp))
        Text("Search Testagram")
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 16.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
}
