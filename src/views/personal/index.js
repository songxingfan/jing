import React from 'react'
import {Button} from 'antd-mobile'

class Personal extends React.Component{
	render(){
		return (
			<div>person
				<input type="button" onClick={()=>{
					this.props.history.push("/login")
				}} 
					disabled={localStorage.userName?true:false}
					value="去登录"/>
				<input type="button" onClick={()=>{
					localStorage.clear();
					this.props.history.push("/login")
				}} value="退出"/>
				{/* <Button onClick={()=>{
					this.props.history.push("/login")
				}} value={"去登录"}></Button> */}
			</div>
		)
	}
}
export default Personal;