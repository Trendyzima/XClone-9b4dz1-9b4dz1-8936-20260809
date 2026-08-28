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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { TestagramApp() }
    }
}

@Composable
private fun TestagramApp() {
    MaterialTheme {
        var selected by remember { mutableIntStateOf(0) }
        val labels = listOf("Home", "Explore", "Notifications", "Messages", "Profile")
        Scaffold(
            topBar = {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Testagram", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    IconButton(onClick = { selected = 1 }) { Icon(Icons.Default.Search, "Explore") }
                }
            },
            bottomBar = {
                NavigationBar {
                    val icons = listOf(Icons.Default.Home, Icons.Default.Search, Icons.Default.NotificationsNone, Icons.Default.MailOutline, Icons.Default.PersonOutline)
                    icons.forEachIndexed { index, icon ->
                        NavigationBarItem(selected = selected == index, onClick = { selected = index }, icon = { Icon(icon, labels[index]) }, label = { Text(labels[index]) })
                    }
                }
            },
            floatingActionButton = {
                FloatingActionButton(onClick = { /* create-post flow */ }) { Icon(Icons.Default.Add, "Create post") }
            }
        ) { padding ->
            HomeScreen(Modifier.padding(padding))
        }
    }
}

@Composable
private fun HomeScreen(modifier: Modifier = Modifier) {
    val posts = listOf(
        "Welcome to Testagram. Stay connected with your community.",
        "Explore the latest conversations and discover creators.",
        "Share your thoughts, photos and videos with your followers."
    )
    LazyColumn(modifier = modifier.fillMaxSize()) {
        item { Spacer(Modifier.height(8.dp)) }
        items(posts) { text -> PostCard(text) }
    }
}

@Composable
private fun PostCard(text: String) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFFF5F5F5)).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).clip(CircleShape).background(Color(0xFFDDDDDD)))
            Spacer(Modifier.size(10.dp))
            Column {
                Text("Testagram", fontWeight = FontWeight.SemiBold)
                Text("@testagram", style = MaterialTheme.typography.bodySmall)
            }
        }
        Spacer(Modifier.height(12.dp))
        Text(text, style = MaterialTheme.typography.bodyLarge)
    }
}
